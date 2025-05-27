const response = await fetch('https://mangadex.org/chapter/491104e9-309b-45bd-8c6d-b56ac15b513b');
const html = await response.text();
console.log(html);