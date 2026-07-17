import lume from "lume/mod.ts";
import code_highlight from "lume/plugins/code_highlight.ts";
import toc from "lume_markdown_plugins/toc.ts";

const site = lume({
  src: "src",
  location: new URL("https://hakaiinstitute.github.io/DarwinKit/"),
});

site.use(code_highlight());
site.use(toc());

// Ship the theme's static assets.
site.copy("styles");
site.copy("js");

export default site;
