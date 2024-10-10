'use strict';
'require view';
'require poll';
'require fs';

let editor = null;
let lastLogLength = 0;
let loggerPath = null;

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

async function initializeAceEditor() {
    await loadScript('/luci-static/resources/view/ssclash/ace/ace.js');
    ace.config.set('basePath', '/luci-static/resources/view/ssclash/ace/');
    editor = ace.edit("logfile");
    editor.setTheme("ace/theme/tomorrow_night_bright");
    editor.session.setMode("ace/mode/text");
    editor.setOptions({
        fontSize: "11px",
        showPrintMargin: false,
        readOnly: true,
        wrap: true
    });

    startPolling();
}

function startPolling() {
    poll.add(() => {
        if (loggerPath) {
            return fs.exec_direct(loggerPath, ['-e', 'clash'])
                .then(res => {
                    if (res) {
                        const lines = res.trim().split('\n');
                        if (lines.length > lastLogLength) {
                            const newLines = lines.slice(lastLogLength);
                            const processedNewLines = newLines.map(processLogLine).join('\n');

                            editor.session.insert({
                                row: editor.session.getLength(),
                                column: 0
                            }, (lastLogLength > 0 ? '\n' : '') + processedNewLines);

                            lastLogLength = lines.length;
                            editor.scrollToLine(editor.session.getLength(), false, true, function() {});
                        }
                    } else if (lastLogLength > 0) {
                        editor.setValue('', 1);
                        lastLogLength = 0;
                    }
                })
                .catch(err => {
                    console.error('Error executing logread:', err);
                });
        }
    });
}

function processLogLine(line) {
    const msgMatch = line.match(/msg="(.*?)"/);
    if (msgMatch) {
        return line.split(']: ')[0] + ']: ' + msgMatch[1];
    }
    return line;
}

return view.extend({
    load: function () {
        return fs.stat('/sbin/logread').then(stat => {
            loggerPath = stat && stat.path ? stat.path : null;
        });
    },

    render: function (stat) {
        const view = E(
            'div',
            { class: 'cbi-map' },
            E('div', { class: 'cbi-section' }, [
                E('div', {
                    id: 'logfile',
                    style: 'width: 100% !important; height: 640px;'
                })
            ])
        );

        initializeAceEditor();

        return view;
    },

    handleSaveApply: null,
    handleSave: null,
    handleReset: null,
});