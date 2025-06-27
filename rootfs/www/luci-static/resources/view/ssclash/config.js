'use strict';
'require view';
'require fs';
'require ui';
'require rpc';

var isReadonlyView = !L.hasViewPermission() || null;
let startStopButton = null;
let editor = null;

const callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});

async function getServiceStatus() {
	try {
		return Object.values((await callServiceList('clash'))['clash']['instances'])[0]?.running;
	} catch (ignored) {
		return false;
	}
}

async function startService() {
	if (startStopButton) startStopButton.disabled = true;
	return fs.exec('/etc/init.d/clash', ['start'])
		.then(() => fs.exec('/etc/init.d/clash', ['enable']))
		.catch(function(e) {
			ui.addNotification(null, E('p', _('Unable to start and enable service: %s').format(e.message)), 'error');
		})
		.finally(() => {
			if (startStopButton) startStopButton.disabled = false;
		});
}

async function stopService() {
	if (startStopButton) startStopButton.disabled = true;
	return fs.exec('/etc/init.d/clash', ['stop'])
		.then(() => fs.exec('/etc/init.d/clash', ['disable']))
		.catch(function(e) {
			ui.addNotification(null, E('p', _('Unable to stop and disable service: %s').format(e.message)), 'error');
		})
		.finally(() => {
			if (startStopButton) startStopButton.disabled = false;
		});
}

async function toggleService() {
	const running = await getServiceStatus();
	if (running) {
		await stopService();
	} else {
		await startService();
	}
	window.location.reload();
}

async function openDashboard() {
	const newWindow = window.open('about:blank', '_blank'); // safer fallback URL

	if (!newWindow) {
		alert(_('Popup was blocked. Please allow popups for this site.'));
		return;
	}

	try {
		const running = await getServiceStatus();

		if (running) {
			const port = 9090;
			const path = 'ui';
			const protocol = window.location.protocol;
			const hostname = window.location.hostname;

			const url = `${protocol}//${hostname}:${port}/${path}/?hostname=${hostname}&port=${port}`;
			newWindow.location.href = url;
		} else {
			newWindow.close();
			alert(_('Service is not running.'));
		}
	} catch (error) {
		newWindow.close();
		console.error('Error checking service status:', error);
		alert(_('Failed to check service status.'));
	}
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

async function initializeAceEditor(content) {
    await loadScript('/luci-static/resources/view/ssclash/ace/ace.js');
    ace.config.set('basePath', '/luci-static/resources/view/ssclash/ace/');
    editor = ace.edit("editor");
    editor.setTheme("ace/theme/tomorrow_night_bright");
    editor.session.setMode("ace/mode/yaml");
    editor.setValue(content);
    editor.clearSelection();
    editor.setOptions({
        fontSize: "12px",
        showPrintMargin: false,
        wrap: true
    });
}

return view.extend({
	load: function() {
		return L.resolveDefault(fs.read('/opt/clash/config.yaml'), '');
	},
	handleSaveApply: function(ev) {
		var value = editor.getValue().trim() + '\n';
		return fs.write('/opt/clash/config.yaml', value).then(function(rc) {
			ui.addNotification(null, E('p', _('Contents have been saved.')), 'info');
			return fs.exec('/etc/init.d/clash', ['reload']);
		}).then(function() {
			window.location.reload();
		}).catch(function(e) {
			ui.addNotification(null, E('p', _('Unable to save contents: %s').format(e.message)), 'error');
		});
	},
	render: async function(config) {
		const running = await getServiceStatus();

		const view = E([
			E('button', {
				'class': 'btn',
				'click': openDashboard
			}, _('Open Dashboard')),
			(startStopButton = E('button', {
				'class': 'btn',
				'click': toggleService,
				'style': 'margin-left: 10px;'
			}, running ? _('Stop service') : _('Start service'))),
			E('span', {
				'style': running ? 'color: green; margin-left: 10px;' : 'color: red; margin-left: 10px;'
			}, running ? _('Clash is running') : _('Clash stopped')),
			E('h2', _('Clash config')),
			E('p', { 'class': 'cbi-section-descr' }, _('Your current Clash config. When applied, the changes will be saved and the service will be restarted.')),
			E('div', {
				'id': 'editor',
				'style': 'width: 100%; height: 640px;'
			})
		]);

		initializeAceEditor(config);

		return view;
	},
	handleSave: null,
	handleReset: null
});