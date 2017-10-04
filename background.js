class RMAPI {
    constructor (key, host, isDebugMode) {
        this.isDebugMode = isDebugMode;
        this.key = key;
        this.userData = {};
        this.urls = {
            current: host + 'users/current.json',
            issues: host + 'issues.json'
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

    getUrl (name, params) {
        return this.urls[name] + '?' + this.stringifyParams(params);
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
                throw new Error('Incorrect user data');
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
        const user = this.getAccountInfo();
        this.request(this.getUrl('issues', {
            assigned_to_id: user.id,
            status_id: 10,
            limit: 100
        }), callback);
    }
}

class Notifier {
    notify (message) {
        switch (Notification.permission) {
            case 'denied':
                return;
            case 'granted':
                return this._notify(message);
            default:
                this.requestPermissionAndNotify(message);
        }
    }

    requestPermissionAndNotify (message) {
        var self = this;
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
}

class App {
    constructor (config, isDebugMode) {
        const self = this;

        this.isDebugMode = isDebugMode;
        this.api = new RMAPI(config.apikey, config.host, this.isDebugMode);
        this.notifier = new Notifier();
        this.api.init(function () {
            self.start();
        });

        this.debug = this.api.debug;
    }

    start () {
        this.interval = setInterval(this.checkAACount.bind(this), 5000);
    }

    checkAACount () {
        if (!this.aaCount) {
            this.aaCount = 0;
        }

        const self = this;

        this.api.getAAIssues(function (error, data) {
            if (error) {
                return;
            }

            if (data.total_count > self.aaCount) {
                self.notifier.notifyAboutNewAAIssues(data.total_count - self.aaCount);
            }

            self.debug(`AA: ${data.total_count}, New: ${data.total_count - self.aaCount}`);
            self.aaCount = data.total_count;
        });
    }
}

function starter () {
    chrome.storage.sync.get([
        'host',
        'apikey'
    ], function (items) {
        if (items.host && items.apikey) {
            const app = new App(items, true);
        } else {
            setTimeout(starter, 5000);
        }
    });
}

starter();
