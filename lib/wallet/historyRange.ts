export const WALLET_HISTORY_RANGE_DAYS = [7, 30, 60, 90] as const;
export type WalletHistoryRangeDays = (typeof WALLET_HISTORY_RANGE_DAYS)[number];
