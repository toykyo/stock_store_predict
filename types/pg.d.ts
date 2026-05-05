declare module "pg" {
  export type QueryResult<T = Record<string, unknown>> = {
    rows: T[];
    rowCount: number | null;
  };

  export type PoolClient = {
    query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
    release(): void;
  };

  export class Pool {
    constructor(config?: { connectionString?: string; max?: number });
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
  }
}