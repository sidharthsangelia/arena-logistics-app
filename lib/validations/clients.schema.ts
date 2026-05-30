import { z } from "zod";

export const clientSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(1, "Company name is required")
    .max(200),

  contactName: z.string().trim().max(200).optional(),

  email: z
    .string()
    .trim()
    .email("Invalid email")
    .optional()
    .or(z.literal("")),

  phone: z.string().trim().max(50).optional(),

  addressLine1: z.string().trim().max(500).optional(),

  city: z.string().trim().max(100).optional(),

  state: z.string().trim().max(100).optional(),

  country: z.string().trim().max(100).optional(),

  postalCode: z.string().trim().max(50).optional(),

  notes: z.string().trim().max(5000).optional(),
});

export type ClientFormValues = z.infer<typeof clientSchema>;