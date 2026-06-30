export type Recommendation = {
  dishId: string;
  rank?: number;
  reason: string;
  facts?: string;
  translatedName?: string;
};
