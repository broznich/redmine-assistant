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
        const rq = new XMLHttpRequest(),
            self = this;

        this.debug('Request url: ' + url);
        rq.open('GET', url, true);
        rq.setRequestHeader('X-Redmine-API-Key', this.key);

        rq.addEventListener('readystatechange', function () {
            if (this.readyState === 4) {
                let result;
                try {
                    result = JSON.parse(this.responseText);
                } catch (e) {
                    result = {};
                }

                self.debug('Response with status code ' + this.status);

                return callback(this.status !== 200 ? new Error('Status code: ' + this.status) : null, result);
            }
        });

        rq.send();
    }

    updateAccountInfo (callback) {
        const userData = this.userData,
            self = this;
        this.request(this.getUrl('current'), function (error, data) {
            if (error || !data.user) {
                return callback(error || new Error('Unknown user'));
            }

            const user = data.user;

            userData.id = user.id;
            userData.login = user.login;
            userData.name = user.firstname + ' ' + user.lastname;

            self.debug('User data updated successfully');
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
        const self = this;
        Notification.requestPermission(function () {
            self.notify(message);
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

        this.initEvents();
        this.start();
    }

    start () {
        const self = this;
        this.api.init(function (error) {
            if (error) {
                return setTimeout(() => self.checkSettings(self.start.bind(self)), 5000);
            }

            self.startTimers();
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

        const self = this;

        this.api.getAAIssues(function (error, data) {
            if (error) {
                return;
            }

            const total = data.total_count;

            if (total !== self.aaCount || self.firstRun) {
                self.firstRun = false;
                if (total > self.aaCount) {
                    self.notifier.notifyAboutNewAAIssues(total - self.aaCount);
                }

                chrome.browserAction.setBadgeText({text: '' + total});
                chrome.storage.sync.set({
                    count: total
                });
            }

            if (total === 0) {
                chrome.browserAction.setBadgeText({text: ''});
            }

            self.debug(`AA: ${total}, New: ${total - self.aaCount}`);
            self.aaCount = total;
        });
    }

    checkSettings (callback) {
        const settings = this.settings,
            api = this.api;
        chrome.storage.sync.get([
            'host',
            'apikey'
        ], function (items) {
            if (settings.host !== items.host || settings.apikey !== items.apikey) {
                api.updateConfig(items);
            }

            if (callback) {
                return callback();
            }
        });
    }

    openAAIssues () {
        chrome.tabs.create({
            url: this.api.getAAIssuesUrl({
                type: 'html'
            })
        });
    }

    initEvents () {
        const self = this;
        chrome.browserAction.onClicked.addListener(function () {
            self.openAAIssues();
        });
    }
}

function starter () {
    chrome.browserAction.setBadgeBackgroundColor({color: [208, 0, 24, 255]});
    chrome.storage.sync.get([
        'host',
        'apikey',
        'count'
    ], function (items) {
        if (items.host && items.apikey) {
            const app = new App(items, true);
        } else {
            setTimeout(starter, 10000);
        }
    });
}

starter();
