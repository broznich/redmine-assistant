
chrome.storage.sync.get({
    apikey: null,
    host: null,
    issueFix: null
}, function (items) {
    fillField('apikey', items.apikey);
    fillField('host', items.host);
    fillField('issueFix', items.issueFix)
});

function fillField (id, value) {
    const el = document.getElementById(id);

    if (!el || !value) {
        return;
    }

    switch (el.type) {
        case 'checkbox':
            el.checked = value;
            break;
        default:
            el.value = value;
    }
}

function getFieldValue (id) {
    const el = document.getElementById(id);

    if (!el) {
        return;
    }

    switch (el.type) {
        case 'checkbox':
            return el.checked;
        default:
            return el.value;
    }

    return null;
}

function saveSettings () {
    const apikey = getFieldValue('apikey'),
        issueFix = getFieldValue('issueFix'),
        host = fixHost(getFieldValue('host'));

    chrome.storage.sync.set({
        apikey: apikey,
        host: host,
        issueFix: issueFix
    }, function () {
        console.log('Saved successfull');
        window.close();
    });
}

function fixHost (host) {
    if (!(/^http[s]?\:\/\//).test(host)) {
        host = 'http://' + host;
    }

    if (!(/\/$/).test(host)) {
        host += '/';
    }

    return host;
}

document.getElementById('save').addEventListener('click', saveSettings);
