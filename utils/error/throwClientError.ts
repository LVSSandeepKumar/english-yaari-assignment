import { ClientError } from "../../config/clientError";

export function throwClientError(
  condition: any,
  message: string,
  statusCode: number = 400,
  errorCode: string = "",
  meta: Object = {},
) {
  // If condition is satisfied i.e. condition = true, throw client error
  if (condition) {
    throw new ClientError(message, statusCode, errorCode, meta);
  }
}
