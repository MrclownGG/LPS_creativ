(function () {
    var remTimer = null;
    function setRem() {
        var screenWidth =
            window.innerWidth ||
            document.documentElement.clientWidth ||
            document.body.clientWidth;
        if (screenWidth > 750) {
            screenWidth = 750;
        }
        var baseFontSize = screenWidth / 10;
        document.documentElement.style.fontSize = baseFontSize + "px";
    }

    function onWindowSize() {
        if (remTimer !== null) {
            clearTimeout(remTimer);
            remTimer = null;
        }
        remTimer = setTimeout(() => {
            setRem();
            remTimer = null;
        }, 0);
    }
    onWindowSize();
    window.addEventListener("resize", onWindowSize);
})()



/**
 * Copy Text
 * @param {String} textToCopy 
 */
function clipboard(textToCopy) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(textToCopy).then(() => {
        }).catch((err) => {
            fallbackCopyText(textToCopy);
        });
    } else {
        fallbackCopyText(textToCopy);
    }
}

function fallbackCopyText(text) {
    var textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "absolute";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);

    textArea.select();
    try {
        var successful = document.execCommand("copy");
        if (!successful) {
            console.error("execCommand failed.");
        }
    } catch (err) {
        console.error("Failed to copy via execCommand", err);
    }

    document.body.removeChild(textArea);
}

async function Request(config) {
    try {
        let headerJson = {};
        var response = await fetch(API_URL + config.url, {
            method: 'POST',
            headers: {
                ...headerJson,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ...config.data,
                sign: generateSign(config.data)
            })
        });
        if (response.ok) {
            var code = result.status;
            if (code === 10000) {
                return Promise.resolve(result);
            } else {
                return Promise.reject(result.statusText);
            }
        } else {
            return Promise.reject('axios Error!');
        }
    } catch (error) {
        console.error('axios Error!', config.url, error);
        return Promise.reject(error);
    }
}


function generateSign(data) {
    var secretKey = '8_)*jhe#rf$WNtb_IBAbfj&avwaw%78yg23b4gB&HIUVA2h(3fsdf^G!ui3ubIB#*';
    var params = data || {}
    var sortedKeys = Object.keys(params).sort();
    var stringToSign = '';
    sortedKeys.forEach((key) => {
        stringToSign += `${key}=${params[key]}&`;
    });
    stringToSign += `key=${secretKey}`;
    var hash = CryptoJS.SHA256(stringToSign).toString(CryptoJS.enc.Hex).toUpperCase();
    return hash;
}

function onDecrypt(content) {
    var key = CryptoJS.enc.Utf8.parse('d?+$JDYe%aX(.x6O^3P`vITSt:@OK^{d');
    var iv = CryptoJS.enc.Utf8.parse('@;|O>%-]7`9oQwGv');
    var decrypted = CryptoJS.AES.decrypt(content, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
    }).toString(CryptoJS.enc.Utf8);
    return decrypted
}

function onEncrypt(content) {
    var key = CryptoJS.enc.Utf8.parse('d?+$JDYe%aX(.x6O^3P`vITSt:@OK^{d');
    var iv = CryptoJS.enc.Utf8.parse('@;|O>%-]7`9oQwGv');
    var encrypted = CryptoJS.AES.encrypt(content, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
    }).toString();
    return encrypted
}
