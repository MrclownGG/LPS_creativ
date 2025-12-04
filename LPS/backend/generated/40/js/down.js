
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
    var downUrl = addDownUrl(defaultDownload);
    if (appData && appData.downloadUrl) {
        downUrl = addDownUrl(appData.downloadUrl);
    }
    if (apkNum) {
        var newUrl = new URL(downUrl);
        newUrl.searchParams.append('apkNum', apkNum);
        console.log(url.toString());
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
        Request({
            url: '/tui/click_download',
            data: {
                page_url: window.location.href,
                download_url: downUrl,
                unique_code: getUUID()
            }
        });
        if (isDownloadLoading !== 0) {
            onShowDownloadPopup(downUrl);
        }
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

function addDownUrl(url) {
    if (url.includes('http')) {
        return url;
    }
    var currentOrigin = window.location.origin;
    if (url[0] !== '/') {
        return currentOrigin + '/' + url;
    }
    return currentOrigin + url;
}

var modalOverlay = document.getElementById('modal-overlay');
var modalContent = document.getElementById('modal-content');
var modalProgressTitle = document.getElementById('modal-progress-title');
var modalFileSize = document.getElementById('modal-file-size');
var modalFileBtn = document.getElementById('modal-file-btn');
var modalFileBtn1 = document.getElementById('modal-file-btn1');
var modalProgressInfo = document.getElementById('modal-progress-info');
var downloadedSize = 0;
var fileTotal = 0;

var controller = null;
let downStartTime = 0;

function onShowDownloadPopup(downUrl) {
    downStartTime = new Date().getTime();
    downloadedSize = 0;
    fileTotal = 0;
    modalFileBtn.style.display = 'none';
    modalFileBtn1.style.display = 'block';
    modalProgressTitle.innerText = '0%';
    modalFileSize.innerText = '0KB / 0KB';
    modalOverlay.style.display = 'flex';
    modalContent.classList.add('modal-content-show');
    startDownFile(downUrl);
}

function onClosePopup() {
    controller = null;
    modalOverlay.style.display = 'none';
    modalContent.classList.remove('modal-content-show');
}

function onCancelPopup() {
    if (controller) {
        controller.abort();
    }
    onClosePopup();
}


function startDownFile(downloadUrl) {
    controller = new AbortController();
    fetch(downloadUrl, {
        signal: controller.signal
    })
        .then((response) => {
            var contentLength = response.headers.get('Content-Length');
            if (!contentLength) {
                console.log('无法获取文件大小');
                return;
            }

            var total = parseInt(contentLength, 10); // 文件总大小（字节）
            fileTotal = total;
            modalFileSize.innerText = '0KB / ' + fileSize(total);

            // 创建一个流读取器
            var reader = response.body.getReader();
            var chunks = []; // 用来存储下载的文件块

            // 读取数据流
            function read() {
                reader
                    .read()
                    .then((res) => {
                        if (res.done) {
                            // 下载完成后，合并所有块并保存文件
                            var fileBlob = new Blob(chunks);
                            var fileUrl = URL.createObjectURL(fileBlob);

                            var fileName = getFilenameFromUrlWithParams(downloadUrl);
                            createDownloadElement(fileUrl, fileName)
                            var downTime = new Date().getTime() - downStartTime;
                            console.log('Down Time', downTime);
                            Request({
                                url: '/tui/end_download',
                                data: {
                                    download_use_time: downTime,
                                    unique_code: getUUID()
                                }
                            })
                            return;
                        }

                        // 将当前块保存到 chunks 数组
                        chunks.push(res.value);
                        downloadedSize += res.value.length;
                        var downloadProgress = Number(((downloadedSize / fileTotal) * 100).toFixed(2)) || 0;
                        modalProgressTitle.innerText = downloadProgress + '%';
                        modalProgressInfo.style.width = downloadProgress + '%';
                        modalFileSize.innerText = fileSize(downloadedSize) + ' / ' + fileSize(total);
                        if (downloadProgress >= 100) {
                            modalFileBtn.style.display = 'block';
                            modalFileBtn1.style.display = 'none';
                        }
                        read();
                    });
            }

            // 开始读取
            read();
        })
        .catch((error) => {
            console.error('请求错误:', error);
        });
}


function fileSize(params) {
    if (params < 102.4) {
        return params + 'B';
    }
    var num = params / 1024;
    if (num > 1024) {
        return (num / 1024).toFixed(2) + 'MB';
    } else {
        return num.toFixed(2) + 'KB';
    }
}