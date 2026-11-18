// Custom error class for throwing known client errors with specific status codes and error codes
export class ClientError extends Error {
  public readonly errorCode: string;
  public readonly statusCode: number;
  public readonly isClientError: boolean; 
  public readonly meta: object;

  constructor(message: string, statusCode: number, errorCode: string, meta: object = {}) {
    super(message);

    this.name = "ClientError";
    this.errorCode = errorCode;
    this.statusCode = statusCode;
    this.meta = meta;
    this.isClientError = true;
  }
}
