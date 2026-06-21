declare module "better-sqlite3" {
  class Database {
    constructor(filename: string);
    exec(sql: string): this;
    pragma(source: string): unknown;
    prepare(sql: string): Database.Statement;
    transaction<Args extends unknown[], Result>(
      fn: (...args: Args) => Result,
    ): (...args: Args) => Result;
    close(): void;
  }

  namespace Database {
    interface Database {
      exec(sql: string): this;
      pragma(source: string): unknown;
      prepare(sql: string): Statement;
      transaction<Args extends unknown[], Result>(
        fn: (...args: Args) => Result,
      ): (...args: Args) => Result;
      close(): void;
    }

    interface Statement {
      all(...params: unknown[]): unknown[];
      get(...params: unknown[]): unknown;
      run(...params: unknown[]): unknown;
    }
  }

  export = Database;
}
