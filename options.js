
chrome.storage.sync.get({
    apikey: null,
    host: null
}, function (items) {
    fillField('apikey', items.apikey);
    fillField('host', items.host);
});

function fillField (id, value) {
    const el = document.getElementById(id);

    if (el && value) {
        el.value = value;
    }
}

function getFieldValue (id) {
    const el = document.getElementById(id);

    if (el && el.value) {
        return el.value;
    }

    return null;
}

function saveSettings () {
    const apikey = getFieldValue('apikey'),
        host = fixHost(getFieldValue('host'));

    chrome.storage.sync.set({
        apikey: apikey,
        host: host
    }, function () {
        console.log('OK');
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
