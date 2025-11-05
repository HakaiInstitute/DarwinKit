import * as S from "effect/Schema";

export const optional = S.optional;

export const string = S.String;

export const optionalString = optional(string);
export const optionalBoolean = optional(S.Boolean);
export const optionalNumber = optional(S.Number);
