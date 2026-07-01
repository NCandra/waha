import { z } from 'zod';
import { DtoToZod } from '@waha/apps/mcp/schemas/DtoToZod';
import { RequestCodeRequest } from '@waha/structures/auth.dto';

export const AuthQRInput = z.object({
  session: z.string(),
});

export const ScreenshotInput = z.object({
  session: z.string(),
});

export const AuthRequestCodeInput = DtoToZod(RequestCodeRequest).extend({
  session: z.string(),
});

export const AuthSendPasskeyResponseInput = z.object({
  session: z.string(),
  response: z
    .union([z.string(), z.record(z.string(), z.any())])
    .describe('WebAuthn response JSON string or object'),
});

export const AuthSendPasskeyConfirmationInput = z.object({
  session: z.string(),
});
