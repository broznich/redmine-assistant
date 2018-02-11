class RMAPI {
    constructor (key, host, isDebugMode) {
        this.isDebugMode = isDebugMode;
        this.key = key;
        this.userData = {};

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

                return callback(this.status !== 200, result);
            }
        });

        rq.send();
    }

    updateAccountInfo (callback) {
        const userData = this.userData,
            self = this;
        this.request(this.getUrl('current'), function (error, data) {
            if (error || !data.user) {
                return setTimeout(self.updateAccountInfo.bind(self, callback), 1000);
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
        const self = this;

        this.aaCount = +config.count;
        this.isDebugMode = isDebugMode;
        this.api = new RMAPI(config.apikey, config.host, this.isDebugMode);
        this.notifier = new Notifier();
        this.api.init(function () {
            self.start();
        });

        this.debug = this.api.debug;
        this.firstRun = true;

        this.initEvents();
    }

    start () {
        this.interval = setInterval(this.checkAACount.bind(this), 5000);
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
    chrome.browserAction.setBadgeBackgroundColor({color: 'red'});
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
