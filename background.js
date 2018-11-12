class RMAPI {
    constructor (key, host, isDebugMode) {
        this.isDebugMode = isDebugMode;
        this.key = key;
        this.userData = {};
        this.updateHost(host);
    }

    updateConfig (config) {
        this.key = config.apikey;
        this.updateHost(config.host);
    }

    updateHost (host) {
        this.urls = {
            current: host + 'users/current',
            issues: host + 'issues'
        };
    }

    init (callback) {
        this.updateAccountInfo(callback);
    }

    debug (message) {
        if (this.isDebugMode) {
            console.log(message);
        }
    }

    getUrl (name, params = {}) {
        const type = params.type;

        if (type) {
            delete params.type;
        }

        return this.urls[name] + (type ? '.' + type : '.json') + '?' + this.stringifyParams(params);
    }

    stringifyParams (params = {}) {
        let result = '';
        for (const param in params) {
            if (params.hasOwnProperty(param)) {
                result += (result ? '&' : '') + param + '=' + params[param];
            }
        }

        return result;
    }

    request (url, callback) {
        const rq = new XMLHttpRequest();

        this.debug('Request url: ' + url);
        rq.open('GET', url, true);
        rq.setRequestHeader('X-Redmine-API-Key', this.key);

        rq.addEventListener('readystatechange', () => {
            if (this.readyState === 4) {
                let result;
                try {
                    result = JSON.parse(this.responseText);
                } catch (e) {
                    result = {};
                }

                this.debug('Response with status code ' + this.status);

                return callback(this.status !== 200 ? new Error('Status code: ' + this.status) : null, result);
            }
        });

        rq.send();
    }

    updateAccountInfo (callback) {
        const userData = this.userData;
        this.request(this.getUrl('current'), (error, data) => {
            if (error || !data.user) {
                return callback(error || new Error('Unknown user'));
            }

            const user = data.user;

            userData.id = user.id;
            userData.login = user.login;
            userData.name = user.firstname + ' ' + user.lastname;

            this.debug('User data updated successfully');
            callback();
        });
    }

    getAccountInfo () {
        return this.userData;
    }

    getAAIssues (callback) {
        this.request(this.getAAIssuesUrl(), callback);
    }

    getAAIssuesUrl (params = {}) {
        const user = this.getAccountInfo();
        params = Object.assign({
            assigned_to_id: user.id,
            status_id: 10,
            limit: 100
        }, params);

        return this.getUrl('issues', params);
    }
}

class Notifier {
    notify (message) {
        switch (Notification.permission) {
            case 'denied':
                console.warn('Not enought permissions to notify');
                return;
            case 'granted':
                return this._notify(message);
            default:
                this.requestPermissionAndNotify(message);
        }
    }

    requestPermissionAndNotify (message) {
        Notification.requestPermission(() => {
            this.notify(message);
        });
    }

    _notify (message) {
        return new Notification('RM Tracker', {
            tag: 'rmtt-message',
            body: message
        });
    }

    notifyAboutNewAAIssues (message) {
        this.notify(`${message} new "Awaiting answer" issue(s)!`);
    }

    notifyAboutAAIssues (message) {
        this.notify(`${message} "Awaiting answer" issue(s)!`);
    }
}

class App {
    constructor (config, isDebugMode) {
        this.aaCount = +config.count;
        this.settings = config;
        this.isDebugMode = isDebugMode;
        this.api = new RMAPI(config.apikey, config.host, this.isDebugMode);
        this.notifier = new Notifier();

        this.debug = this.api.debug;
        this.firstRun = true;
    }

    start () {
        this.initEvents();
        this.api.init(error => {
            if (error) {
                return setTimeout(() => this.checkSettings(this.start.bind(this)), 5000);
            }

            this.startTimers();
        });
    }

    startTimers () {
        this.interval = setInterval(this.checkAACount.bind(this), 10000);
        this.settingsInterval = setInterval(this.checkSettings.bind(this), 30000);
    }

    checkAACount () {
        // NaN, text or other except number
        if (!this.aaCount > 0) {
            this.aaCount = 0;
        }

        this.api.getAAIssues((error, data) => {
            if (error) {
                return;
            }

            const total = data.total_count;

            if (total !== this.aaCount || this.firstRun) {
                this.firstRun = false;
                if (total > this.aaCount) {
                    this.notifier.notifyAboutNewAAIssues(total - this.aaCount);
                }

                chrome.browserAction.setBadgeText({text: '' + total});
                chrome.storage.sync.set({
                    count: total
                });
            }

            if (total === 0) {
                chrome.browserAction.setBadgeText({text: ''});
            }

            this.debug(`AA: ${total}, New: ${total - this.aaCount}`);
            this.aaCount = total;
        });
    }

    checkSettings (callback) {
        const settings = this.settings,
            api = this.api;
        chrome.storage.sync.get([
            'host',
            'apikey'
        ], items => {
            if (settings.host !== items.host || settings.apikey !== items.apikey) {
                api.updateConfig(items);
            }

            if (callback) {
                return callback();
            }
        });
    }

    openAAIssues () {
        console.log('Open AA');
        chrome.tabs.create({
            url: this.api.getAAIssuesUrl({
                type: 'html'
            })
        });
    }

    initEvents () {
        chrome.browserAction.onClicked.addListener(() => {
            this.openAAIssues();
        });
    }
}

class PageModifier {
    constructor (config) {
        this.config = config;
    }

    subscribe () {
        const hostRegex = new RegExp(`^${this.config.host}`);
        chrome.tabs.onUpdated.addListener((tabId, page, config) => {
            if (config.status === 'complete' && hostRegex.test(config.url)) {
                chrome.tabs.executeScript(tabId, {
                    file: 'contentScripts/decorateIssueId.js'
                });
            }
        });
    }
}

class SettingWatcher {
    constructor () {
        this.listeners = [];
        this.cached = '';
        this.interval = setInterval(this.check.bind(this), 30000);
        this.check();
    }

    onChangeOnce (fn) {
        this.listeners.push(fn);
    }

    check () {
        chrome.storage.sync.get([
            'host',
            'apikey',
            'count',
            'issueFix'
        ], settings => {
            const serialized = JSON.stringify(settings);

            if (serialized !== this.cached) {
                this.cached = serialized;
                this.applyChange(settings);
            }
        });
    }

    applyChange (settings) {
        const listeners = this.listeners.splice(0);
        this.listeners = [];
        listeners.forEach(listener => listener(settings));
    }
}

function starter () {
    chrome.browserAction.setBadgeBackgroundColor({color: [208, 0, 24, 255]});

    const sWatcher = new SettingWatcher();

    sWatcher.onChangeOnce(settings => {
        if (settings.host && settings.apikey) {
            const app = new App(settings, true);

            if (settings.issueFix) {
                const pageModifier = new PageModifier(settings);
                pageModifier.subscribe();
            }

            app.start();
            sWatcher.onChangeOnce(() => location.reload());
        }
    });
}

starter();
