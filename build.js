const {execSync} = require("child_process");
const fs = require("fs-extra");

const DIST_FOLDER = "./dist";

fs.emptydirSync(DIST_FOLDER);
execSync("tsc");
["package.json", "README.md"].forEach(f => fs.copySync(f, `${DIST_FOLDER}/${f}`));
