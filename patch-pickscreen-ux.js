const fs = require("fs");

const path = "apps/mobile/src/screens/pick/PickScreen.tsx";
let content = fs.readFileSync(path, "utf8");

content = content.replace(
  `<Screen>
        <RecommendationCard result={analyze.result} onReset={analyze.reset} />
      </Screen>`,
  `<Screen scrollToTopKey="result">
        <RecommendationCard result={analyze.result} onReset={analyze.reset} />
      </Screen>`
);

content = content.replace(
  `analyze.loading ? "PickForMe prüft..." : "3 passende Gerichte finden"`,
  `analyze.loading ? "PickForMe prüft..." : "Finde meine 3 passenden Gerichte"`
);

fs.writeFileSync(path, content, "utf8");
