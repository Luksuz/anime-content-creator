const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer fc-23644dee3b174785bf1a8c557a3c4619'
    },
    body: JSON.stringify({
        url: 'https://mangadex.org/chapter/73f848d6-c155-41d6-be05-66b784c71260',
        formats: ['screenshot@fullPage'],
        onlyMainContent: false,
        waitFor: 20000
    })
});

const data = await response.json();
console.log(data);