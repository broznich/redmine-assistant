class RMAPI {
    constructor (key) {
        this.key = key;
        this.userData = {};
        this.urls = {
            current: 'https://rm.innomdc.com/users/current.json',
            issues: 'https://rm.innomdc.com/issues.json'
        };
    }

    init (callback) {
        this.updateAccountInfo(callback);
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
        const rq = new XMLHttpRequest();

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

                return callback(this.status !== 200, result);
            }
        });

        rq.send();
    }

    updateAccountInfo (callback) {
        const userData = this.userData;
        this.request(this.getUrl('current'), function (error, data) {
            if (error || !data.user) {
                throw new Error('Incorrect user data');
            }

            const user = data.user;

            userData.id = user.id;
            userData.login = user.login;
            userData.name = user.firstname + ' ' + user.lastname;
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
    constructor () {
        const self = this;
        this.api = new RMAPI('APIKEY');
        this.notifier = new Notifier();
        this.api.init(function () {
            self.start();
        });
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

            self.aaCount = data.total_count;
        });
    }
}

const app = new App();
