import type {
  DatabaseDriver,
  ConnectionConfig,
  TableInfo,
  ColumnInfo,
  QueryResult,
  ProcedureInfo,
  SchemaInfo,
} from "../types.js";

export function createDriver(): DatabaseDriver {
  let pool: any = null;
  let sql: any = null;

  return {
    driverName: "mssql",

    async connect(config: ConnectionConfig): Promise<void> {
      sql = await import("mssql");
      pool = await new sql.default.ConnectionPool(
        config.connection
      ).connect();
    },

    async disconnect(): Promise<void> {
      if (pool) {
        await pool.close();
        pool = null;
      }
    },

    async listTables(schema?: string): Promise<readonly TableInfo[]> {
      const baseQuery = `
        SELECT
          s.name AS SchemaName,
          t.name AS TableName,
          p.rows AS RowCount
        FROM sys.tables t
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0,1)
      `;

      const request = pool.request();
      let query: string;

      if (schema) {
        request.input("schema", sql.default.NVarChar, schema);
        query = baseQuery + ` WHERE s.name = @schema ORDER BY s.name, t.name`;
      } else {
        query = baseQuery + ` ORDER BY s.name, t.name`;
      }

      const result = await request.query(query);
      return result.recordset.map((r: any) => ({
        schema: r.SchemaName,
        name: r.TableName,
        rowCount: r.RowCount,
      }));
    },

    async getTableSchema(
      table: string,
      schema?: string
    ): Promise<readonly ColumnInfo[]> {
      const s = schema ?? "dbo";
      const result = await pool
        .request()
        .input("table", sql.default.NVarChar, table)
        .input("schema", sql.default.NVarChar, s).query(`
          SELECT
            c.COLUMN_NAME,
            c.DATA_TYPE,
            c.CHARACTER_MAXIMUM_LENGTH,
            c.IS_NULLABLE,
            c.COLUMN_DEFAULT,
            CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 'YES' ELSE 'NO' END AS IS_PRIMARY_KEY,
            fk.REFERENCED_TABLE_NAME,
            fk.REFERENCED_COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS c
          LEFT JOIN (
            SELECT ku.COLUMN_NAME
            FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
            JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
            WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND ku.TABLE_NAME = @table AND ku.TABLE_SCHEMA = @schema
          ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
          LEFT JOIN (
            SELECT ccu.COLUMN_NAME, kcu2.TABLE_NAME AS REFERENCED_TABLE_NAME, kcu2.COLUMN_NAME AS REFERENCED_COLUMN_NAME
            FROM INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu
            JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc ON ccu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
            JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu2 ON rc.UNIQUE_CONSTRAINT_NAME = kcu2.CONSTRAINT_NAME
            WHERE ccu.TABLE_NAME = @table AND ccu.TABLE_SCHEMA = @schema
          ) fk ON c.COLUMN_NAME = fk.COLUMN_NAME
          WHERE c.TABLE_NAME = @table AND c.TABLE_SCHEMA = @schema
          ORDER BY c.ORDINAL_POSITION
        `);

      return result.recordset.map((r: any) => ({
        name: r.COLUMN_NAME,
        dataType: r.DATA_TYPE,
        maxLength: r.CHARACTER_MAXIMUM_LENGTH,
        isNullable: r.IS_NULLABLE === "YES",
        defaultValue: r.COLUMN_DEFAULT,
        isPrimaryKey: r.IS_PRIMARY_KEY === "YES",
        foreignKeyTable: r.REFERENCED_TABLE_NAME ?? null,
        foreignKeyColumn: r.REFERENCED_COLUMN_NAME ?? null,
      }));
    },

    async runQuery(query: string, maxRows: number): Promise<QueryResult> {
      const result = await pool.request().query(query);
      const allRows = result.recordset ?? [];
      const truncated = allRows.length > maxRows;
      const rows = truncated ? allRows.slice(0, maxRows) : allRows;
      const columns =
        result.recordset.columns
          ? Object.keys(result.recordset.columns)
          : rows.length > 0
            ? Object.keys(rows[0])
            : [];

      return { columns, rows, rowCount: allRows.length, truncated };
    },

    async describeProcedure(name: string): Promise<ProcedureInfo | null> {
      const defResult = await pool
        .request()
        .input("proc", sql.default.NVarChar, name)
        .query(
          `SELECT OBJECT_DEFINITION(OBJECT_ID(@proc)) AS Definition`
        );

      const definition = defResult.recordset[0]?.Definition;
      if (!definition) return null;

      const paramResult = await pool
        .request()
        .input("proc", sql.default.NVarChar, name).query(`
          SELECT
            p.name AS ParameterName,
            TYPE_NAME(p.user_type_id) AS DataType,
            p.is_output AS IsOutput
          FROM sys.parameters p
          JOIN sys.procedures sp ON p.object_id = sp.object_id
          WHERE sp.name = @proc
          ORDER BY p.parameter_id
        `);

      return {
        name,
        parameters: paramResult.recordset.map((p: any) => ({
          name: p.ParameterName,
          dataType: p.DataType,
          isOutput: p.IsOutput,
        })),
        definition,
      };
    },

    async listSchemas(): Promise<readonly SchemaInfo[]> {
      const result = await pool.request().query(
        `SELECT name FROM sys.schemas
         WHERE name NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest')
           AND name NOT LIKE 'db_%'
         ORDER BY name`
      );
      return result.recordset.map((r: any) => ({ name: r.name }));
    },
  };
}
