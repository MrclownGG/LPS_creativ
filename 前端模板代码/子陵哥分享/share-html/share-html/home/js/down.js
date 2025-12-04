
function downApk() {
    if (appData && appData.userID) {
        // APP Share Param
        var copyInfo = '#bminvited#' + appData.userID + '#@#';
        clipboard(copyInfo);
    } else if (getUrlParams('fbclid')) {
        var copyData = {
            userAgent: navigator.userAgent,
            url: window.location.href,
            cookie: JSON.stringify(getcookie())
        }
        var str = '#feiiff##' + onEncrypt(JSON.stringify(copyData));
        clipboard(str);
    }
    if (window.fbq) {
        if (channel) {
            window.fbq('track', 'download');
        }
    }
    var downUrl = defaultDownload;
    if (appData && appData.downloadUrl) {
        downUrl = appData.downloadUrl;
        if (apkNum) {
            var newUrl = new URL(downUrl);
            newUrl.searchParams.append('apkNum', 'value');
            console.log(url.toString());
        }
    }
    var fileName = getFilenameFromUrlWithParams(downUrl);
    if (appData === null || !appData.userID) {
        Request({
            url: '/DownloadReport/index',
            data: {
                pageUrl: encodeURIComponent(window.location.href),
                downloadUrl: encodeURIComponent(downUrl),
                channelID: channel
            }
        });
    }
    if (channel === '8' || channel === '9') {
        gtag_report_conversion(downUrl, channel);
    } else {
        createDownloadElement(downUrl, fileName);
    }
}

function createDownloadElement(url, name) {
    var downloadElement = document.createElement('a');
    downloadElement.href = url;
    downloadElement.download = name;
    document.body.appendChild(downloadElement);
    downloadElement.click();
    document.body.removeChild(downloadElement);
}

/**
 * Get File Name
 * @param {String} url 
 * @returns 
 */
function getFilenameFromUrlWithParams(url) {
    var path = url.split('?')[0].split('#')[0];
    var filename = path.split('/').pop();

    if (!filename || filename === path) {
        var params = new URLSearchParams(url.split('?')[1] || '');
        return params.get('filename') || params.get('file') || 'download';
    }

    return filename;
}

/**
 * google downFile
 * @param {String} url  
 * @returns 
 */
async function gtag_report_conversion(url) {
    if (googleInfo.sendTo) {
        var callback = function () {
            if (typeof (url) != 'undefined') {
                window.location = url;
            }
        };
        gtag('event', 'conversion', {
            'send_to': googleInfo.sendTo,
            'event_callback': callback
        });
    }
    return false;
}