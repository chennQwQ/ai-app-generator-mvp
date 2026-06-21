declare module "better-sqlite3" {
  class Database {
    constructor(filename: string);
    exec(sql: string): this;
    pragma(source: string): unknown;
    prepare(sql: string): Database.Statement;
    close(): void;
  }

  namespace Database {
    interface Database {
      exec(sql: string): this;
      pragma(source: string): unknown;
      prepare(sql: string): Statement;
      close(): void;
    }

    interface Statement {
      all(...params: unknown[]): unknown[];
    }
  }

  export = Database;
}
