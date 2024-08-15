'use strict';
'require view';
'require poll';
'require fs';

return view.extend({
	load: function () {
		return fs.stat('/sbin/logread');
	},

	render: function (stat) {
		const loggerPath = stat && stat.path ? stat.path : null;

		poll.add(() => {
			if (loggerPath) {
				return fs.exec_direct(loggerPath, ['-e', 'clash'])
					.then(res => {
						const log = document.getElementById('logfile');
						// Without log processing
						// log.value = res ? res.trim() : _('');
						// Without log processing
						// With log processing
						if (res) {
							const processedLog = res.trim().split('\n').map(line => {
								const msgMatch = line.match(/msg="(.*?)"/);
								if (msgMatch) {
									return line.split(']: ')[0] + ']: ' + msgMatch[1];
								}
								return line;
							}).join('\n');

							log.value = processedLog;
						} else {
							log.value = _('');
						}
						// With log processing
						log.scrollTop = log.scrollHeight;
					})
					.catch(err => {
						console.error('Error executing logread:', err);
					});
			}
		});

		return E(
			'div',
			{ class: 'cbi-map' },
			E('div', { class: 'cbi-section' }, [
				E('textarea', {
					id: 'logfile',
					style: 'width: 100% !important; padding: 5px; font-family: monospace',
					readonly: 'readonly',
					wrap: 'off',
					rows: 35,
				}),
			])
		);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null,
});
