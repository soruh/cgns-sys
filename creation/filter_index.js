let base = process.argv[2];
let input = require("fs")
  .readFileSync(0)
  .toString();
let links = input
  .split("\n")
  .map(x => x.trim())
  .map(line => line.match(/href="([^"#]+)/))
  .filter(x => x)
  .map(x => x[1])
  .filter((x, i, all) => all.indexOf(x) == i)
  .filter(x => x.split(".").slice(-1)[0] == "html")
  .filter(x => x[0] != ".")
  .filter(x => x != "general.html")
  .map(x => base + "/" + x);

console.log(links.join("\n"));
