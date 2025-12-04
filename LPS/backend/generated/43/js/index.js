
function onLoadWebData() {
    try {
        var data = getUrlParams('data');
        if (data) {
            var content = decodeURIComponent(data);
            var decrypted = onDecrypt(content);
            var jsonContent = JSON.parse(decrypted);
            // jsonContent.downloadUrl;
            // jsonContent.userID;
            appData = jsonContent;
            console.log("App Params", appData);
        }
    } catch (e) {
        console.error('App Params JSON Error', e);
    }
}

function onInitLoad() {
    var currentDate = new Date().getTime();
    var floatingTime = currentDate - window.webStartTime;
    console.log('Loading Time', floatingTime);
    setTimeout(function () {
        var content = ''
        try {
            if (appData) {
                content = JSON.stringify(appData)
            }
            if (appData === null || !appData.userID) {
                var data = {
                    userAgent: navigator.userAgent,
                    url: encodeURIComponent(window.location.href),
                    content: content,
                    cookie: JSON.stringify(getcookie()),
                    channel_id: channel || '',
                    unique_code: getUUID(),
                    loaded_use_time: floatingTime
                }
                Request({
                    url: '/tui/add_guiyin',
                    data: data
                });
            }
        } catch (error) {
            console.log(error)
        }
    }, 1000)
}

function loadGoogleGtag() {
    if (googleInfo.gtagId) {
        var script = document.createElement('script');
        script.src = 'https://www.googletagmanager.com/gtag/js?id=' + googleInfo.gtagId;
        script.async = true;
        document.head.appendChild(script);
        script.onload = () => {
            window.dataLayer = window.dataLayer || [];
            var date = new Date();
            gtag('js', date);
            gtag('config', googleInfo.gtagId);
        };
    }
}


function loadFbq() {
    if (window.fbq) {
        if (facebookInfo.id) {
            window.fbq('init', facebookInfo.id);
        }
        if (facebookInfo.token) {
            window.fbq('track', 'CustomEvent', {
                token: facebookInfo.token
            });
        }
    }
}


function gtag(...data) {
    if (window.dataLayer) {
        window.dataLayer.push(arguments);
    }
}

/**
 * cookie List<string>
 */
function getcookie() {
    var arrstr = document.cookie.split("; ");
    return arrstr
}

/**
 * GET URL params
 * @param {String} name 
 */
function getUrlParams(name) {
    var url = window.location.href;
    name = name.replace(/[\[\]]/g, '\\$&');
    var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)');

    var results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';

    return decodeURIComponent(results[2].replace(/\+/g, ' '));
}
