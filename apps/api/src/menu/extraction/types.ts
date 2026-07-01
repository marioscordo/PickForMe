export type MenuSourceFormat = "html";

export type MenuExtractionConfidence = "high" | "medium" | "low";

export type MenuExtractionItem = {
  title: string;
  description?: string;
  price?: string;
  category?: string;
  sourceFormat: MenuSourceFormat;
  confidence: number;
  sourceText: string;
};

export type MenuExtractionResult = {
  sourceFormat: MenuSourceFormat;
  items: MenuExtractionItem[];
  confidence: MenuExtractionConfidence;
  warnings: string[];
  fragments: string[];
};
