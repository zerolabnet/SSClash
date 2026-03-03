'use strict';
'require view';
'require poll';
'require fs';

let editor = null;
let lastLogLength = 0;
let loggerPath = null;
const MAX_INITIAL_LINES = 100;

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
        if (!loggerPath) return;

        return fs.exec_direct(loggerPath, ['-e', 'clash'])
            .then(res => {
                if (res) {
                    const all_lines = res.trim().split('\n');
                    const total_lines_count = all_lines.length;

                    if (total_lines_count < lastLogLength) {
                        editor.setValue('', -1);
                        lastLogLength = 0;
                    }

                    let lines_to_process;

                    if (lastLogLength === 0 && total_lines_count > MAX_INITIAL_LINES) {
                        const skippedCount = total_lines_count - MAX_INITIAL_LINES;
                        editor.session.insert({ row: 0, column: 0 }, _('--- Log truncated, skipped %d older lines ---').format(skippedCount) + '\n');
                        lines_to_process = all_lines.slice(-MAX_INITIAL_LINES);
                    }
                    else if (total_lines_count > lastLogLength) {
                        lines_to_process = all_lines.slice(lastLogLength);
                    }

                    if (lines_to_process && lines_to_process.length > 0) {
                        const processedNewLines = lines_to_process
                            .map(processLogLine)
                            .filter(Boolean)
                            .join('\n');

                        if (processedNewLines) {
                            editor.session.insert({
                                row: editor.session.getLength(),
                                column: 0
                            }, (editor.session.getLength() > 1 ? '\n' : '') + processedNewLines);

                            editor.scrollToLine(editor.session.getLength(), false, true, function() {});
                        }
                    }

                    lastLogLength = total_lines_count;

                } else if (lastLogLength > 0) {
                    editor.setValue('', -1);
                    lastLogLength = 0;
                }
            })
            .catch(err => {
                console.error(_('Error executing logread:'), err);
                if (lastLogLength === 0) {
                     editor.setValue(_('Error reading logs: %s').format(err.message), -1);
                     lastLogLength = 1;
                }
            });
    });
}

function processLogLine(line) {
    const match = line.match(/^.*? ([\d:]{8}) .*?daemon\.(\w+)\s+(clash(?:-rules)?)\b\[\d+\]:\s*(.*)$/);

    if (!match) {
        return null;
    }

    const [, time, level, daemon, originalMessage] = match;
    let message = originalMessage;

    const msgMatch = originalMessage.match(/^msg="(.*)"$/);
    if (msgMatch) {
        message = msgMatch[1];
    }

    const clashTimeMatch = message.match(/^time="[^"]+"\s+level=\w+\s+msg="(.*)"$/);
    if (clashTimeMatch) {
        message = clashTimeMatch[1];
    }

    let marker = '⚪';
    if (daemon === 'clash') {
        marker = '🔵';
    } else if (daemon === 'clash-rules') {
        marker = '🟢';
    }

    return `[${time}] ${marker} [${daemon}] [${level.toUpperCase()}] ${message}`;
}

return view.extend({
    load: function () {
        return fs.stat('/sbin/logread').then(stat => {
            loggerPath = stat && stat.path ? stat.path : null;
        }).catch(() => {
            loggerPath = null;
        });
    },

    render: function () {
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
