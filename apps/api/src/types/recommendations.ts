export type StarterPairing = {
  nameOriginal: string;
  translatedName?: string;
  priceRaw?: string;
  evidence?: string;
};

export type Recommendation = {
  dishId: string;
  rank?: number;
  reason: string;
  facts?: string;
  priceOriginal?: string;
  priceCurrency?: string;
  priceDisplay?: string;
  priceApproxDisplay?: string;
  priceExchangeRateDate?: string;
  translatedName?: string;
  translatedDescription?: string;
  descriptionOriginal?: string;
  starter?: StarterPairing;
};
