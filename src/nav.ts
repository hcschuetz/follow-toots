document.querySelector("#nav")!.innerHTML = `
<a href="about.html">About</a>
<a href=".">Overview</a>
<a href="config.html">Configuration</a>
<a href="https://github.com/hcschuetz/follow-toots">Source</a>
`
// for development only:
+ (location.hostname === "localhost" ? `
<a href="raw-data.html">Raw Data</a>  
` : "");
