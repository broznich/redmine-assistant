(function () {
    const start = window.performance.now();

    let issues = document.body.innerHTML.match(/<[^>]+>[^<]+#\d{3,5}/g),
        uniqTags = {},
        converted = 0;

    issues = issues ? issues.map(item => { const match = item.match(/^<([\w]+)[\s>]/); return match ? match[1] : null}) : [];

    issues.forEach(issue => uniqTags[issue] = true);

    if (issues.length === 0) {
        return;
    }

    const allTags = document.querySelectorAll(Object.keys(uniqTags).join(','));

    for (const tag of allTags) {
        if (tag.tagName === 'A') {
            continue;
        }
    
        let content = tag.innerHTML;
        if (content.includes('<')) {
            continue;
        }

        const tagIssues = content.match(/#\d{1,5}/g);
        if (!tagIssues) {
            continue;
        }

        tagIssues.forEach(issue => {
            content = content.replace(issue, generateIssueUrl(issue));
        });

        tag.innerHTML = content;
        converted++;
    }

    function generateIssueUrl (issue) {
        return `<a href="${location.origin}/issues/${issue.substr(1)}">${issue}</a>`;
    }

    console.log(`Patching time: ${window.performance.now() - start} ms; Converted: ${converted}`);
})();