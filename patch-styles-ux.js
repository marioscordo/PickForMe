const fs = require("fs");

const path = "apps/mobile/src/theme/styles.ts";
let content = fs.readFileSync(path, "utf8");

content = content.replace(
  `  textArea: {
    minHeight: 230,
    maxHeight: 330,
    textAlignVertical: "top",
    lineHeight: 22
  },`,
  `  textArea: {
    minHeight: 150,
    maxHeight: 190,
    textAlignVertical: "top",
    lineHeight: 22
  },`
);

content = content.replace(
  `  buttonText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 17
  },`,
  `  buttonText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 16,
    textAlign: "center"
  },`
);

fs.writeFileSync(path, content, "utf8");
