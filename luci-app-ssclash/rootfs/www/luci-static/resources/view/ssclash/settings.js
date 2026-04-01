'use strict';
'require view';
'require fs';
'require ui';
'require network';

// =============================================================================
// SECTION: Network interface helpers
// =============================================================================

async function getNetworkInterfaces() {
    const result = [];
    const seenInterfaces = new Set();

    try {
        const sysNetResult = await fs.exec('ls', ['/sys/class/net/']);
        if (sysNetResult.code === 0 && sysNetResult.stdout) {
            const sysNetInterfaces = sysNetResult.stdout.trim().split('\n');
            sysNetInterfaces.forEach(function(name) {
                name = name.trim();
                if (name && !seenInterfaces.has(name) && name !== 'lo') {
                    seenInterfaces.add(name);
                    result.push(createInterfaceEntry(name));
                }
            });
        }
    } catch (e) {
        console.error('Failed to read /sys/class/net:', e);
    }

    try {
        const ipResult = await fs.exec('ip', ['link', 'show']);
        if (ipResult.code === 0 && ipResult.stdout) {
            const lines = ipResult.stdout.split('\n');
            lines.forEach(function(line) {
                const match = line.match(/^\d+:\s+([^:@]+)/);
                if (match && match[1] && match[1] !== 'lo') {
                    const name = match[1];
                    if (!seenInterfaces.has(name)) {
                        seenInterfaces.add(name);
                        result.push(createInterfaceEntry(name));
                    }
                }
            });
        }
    } catch (e) {
        console.error('Failed to execute ip link:', e);
    }

    try {
        const bridgeResult = await fs.exec('brctl', ['show']);
        if (bridgeResult.code === 0 && bridgeResult.stdout) {
            const lines = bridgeResult.stdout.split('\n');
            lines.forEach(function(line) {
                const match = line.match(/^([^\s]+)\s/);
                if (match && match[1] && match[1] !== 'bridge') {
                    const name = match[1];
                    if (!seenInterfaces.has(name)) {
                        seenInterfaces.add(name);
                        result.push(createInterfaceEntry(name));
                    }
                }
            });
        }
    } catch (e) {
    }

    try {
        const interfaces = await network.getDevices();
        interfaces.forEach(function(iface) {
            if (iface.getName() && iface.getName() !== 'lo') {
                const name = iface.getName();
                if (!seenInterfaces.has(name)) {
                    seenInterfaces.add(name);
                    result.push(createInterfaceEntry(name));
                }
            }
        });
    } catch (e) {
        console.warn('LuCI network API not available:', e.message);
    }

    try {
        const networks = await network.getNetworks();
        networks.forEach(function(net) {
            const device = net.getL3Device();
            if (device && device.getName() && device.getName() !== 'lo') {
                const name = device.getName();
                if (!seenInterfaces.has(name)) {
                    seenInterfaces.add(name);
                    result.push(createInterfaceEntry(name));
                }
            }
        });
    } catch (e) {
        console.warn('LuCI network.getNetworks() not available:', e.message);
    }

    if (result.length === 0) {
        console.warn('No network interfaces found on this system');
    } else {
        console.log(`Found ${result.length} network interfaces:`, result.map(i => i.name).join(', '));
    }

    const filteredResult = result.filter(iface => iface.name !== 'clash-tun');

    const categoryOrder = ['wan', 'ethernet', 'wifi', 'usb', 'vpn', 'virtual', 'other'];
    return filteredResult.sort((a, b) => {
        const catA = categoryOrder.indexOf(a.category);
        const catB = categoryOrder.indexOf(b.category);
        if (catA !== catB) return catA - catB;
        return a.name.localeCompare(b.name);
    });
}

function createInterfaceEntry(name) {
    let category = 'other';
    let icon = '🔗';

    if (name.match(/\.\d+$/)) {
        category = 'ethernet';
        icon = '🏷️';
    } else if (name.match(/^(br-|bridge)/)) {
        category = 'ethernet';
        icon = '🔀';
    } else if (name.match(/^(eth|lan|switch|bond|team)/)) {
        category = 'ethernet';
        icon = '🌐';
    } else if (name.match(/^(wlan|wifi|ath|phy|ra|mt|rtl|iwl)/)) {
        category = 'wifi';
        icon = '📶';
    } else if (name.match(/^(wan|ppp|modem|3g|4g|5g|lte|gsm|cdma|hsdpa|hsupa|umts)/)) {
        category = 'wan';
        icon = '🌍';
    } else if (name.match(/^(tun|tap|vpn|wg|nord|express|surf|pia|ovpn|openvpn|l2tp|pptp|sstp|ikev2|ipsec)/)) {
        category = 'vpn';
        icon = '🔐';
    } else if (name.match(/^(usb|rndis|cdc|ecm|ncm|qmi|rmnet|mbim)/)) {
        category = 'usb';
        icon = '🔌';
    } else if (name.match(/^(veth|macvlan|ipvlan|dummy|vrf|vcan|vxcan)/)) {
        category = 'virtual';
        icon = '💭';
    }
    return {
        name: name,
        description: name,
        category: category,
        icon: icon
    };
}

// =============================================================================
// SECTION: HWID (device fingerprint) collection and YAML injection
// NOTE: This feature is opt-in (disabled by default). When enabled it sends
//       a hashed MAC address, OpenWrt version, and device model as custom HTTP
//       headers to every proxy-provider request. See createAdditionalSettings()
//       for the UI toggle and its description.
// =============================================================================

async function getHwidValues() {
    try {
        let hwid = 'unknown';
        try {
            const macResult = await fs.exec('/bin/sh', ['-c',
                "cat /sys/class/net/eth0/address 2>/dev/null | tr -d ':' | md5sum | cut -c1-14"
            ]);
            if (macResult.code === 0 && macResult.stdout) {
                hwid = macResult.stdout.trim();
            }
        } catch (e) {}

        let verOs = 'unknown';
        try {
            const verResult = await fs.exec('/bin/sh', ['-c',
                ". /etc/openwrt_release && echo $DISTRIB_RELEASE"
            ]);
            if (verResult.code === 0 && verResult.stdout) {
                verOs = verResult.stdout.trim();
            }
        } catch (e) {}

        let deviceModel = 'Router';
        try {
            const modelResult = await fs.exec('/bin/sh', ['-c',
                "cat /tmp/sysinfo/model 2>/dev/null"
            ]);
            if (modelResult.code === 0 && modelResult.stdout) {
                deviceModel = modelResult.stdout.trim();
            }
        } catch (e) {}

        return { hwid, verOs, deviceModel };
    } catch (e) {
        return {
            hwid: 'unknown',
            verOs: 'unknown',
            deviceModel: 'Router'
        };
    }
}

function addHwidToYaml(yamlContent, userAgent, deviceOS, hwid, verOs, deviceModel) {
    const lines = yamlContent.split('\n');
    const result = [];
    let inProxyProviders = false;
    let inProvider = false;
    let currentProvider = [];
    let hasHeader = false;

    function flushProvider() {
        result.push(...currentProvider);
        if (!hasHeader) {
            while (result.length > 0 && result[result.length - 1].trim() === '') {
                result.pop();
            }
            result.push('    header:');
            result.push(`      User-Agent: [${userAgent}]`);
            result.push(`      x-hwid: [${hwid}]`);
            result.push(`      x-device-os: [${deviceOS}]`);
            result.push(`      x-ver-os: [${verOs}]`);
            result.push(`      x-device-model: [${deviceModel}]`);
            result.push('');
        }
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.match(/^proxy-providers:\s*$/)) {
            inProxyProviders = true;
            result.push(line);
            continue;
        }

        if (inProxyProviders) {
            if (line.match(/^[a-zA-Z]/)) {
                if (inProvider) flushProvider();
                inProxyProviders = false;
                inProvider = false;
                result.push(line);
                continue;
            }

            const providerMatch = line.match(/^  ([a-zA-Z0-9_-]+):\s*$/);
            if (providerMatch) {
                if (inProvider) flushProvider();
                currentProvider = [line];
                inProvider = true;
                hasHeader = false;
                continue;
            }

            if (inProvider && line.match(/^    header:\s*$/)) {
                hasHeader = true;
            }

            if (inProvider) {
                currentProvider.push(line);
            } else {
                result.push(line);
            }
        } else {
            result.push(line);
        }
    }

    if (inProvider) flushProvider();

    return result.join('\n');
}

// =============================================================================
// SECTION: config.yaml transformations
// These functions perform text-based mutations of the YAML config.  They rely
// on heuristic line scanning (not a full YAML parser) and are sensitive to
// indentation and key placement.  The expected config.yaml format is the one
// produced by Mihomo / generated by this app.
// =============================================================================

function transformProxyMode(content, proxyMode, tunStack) {
    let lines = content.split('\n');
    let newLines = [];
    let inTunSection = false;
    let tunIndentLevel = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed.match(/^#\s*Proxy\s+Mode:/i)) continue;

        if (trimmed === '' && i + 1 < lines.length && lines[i + 1].trim() === '') {
            continue;
        }

        if (trimmed === '' && i + 1 < lines.length) {
            const nextLine = lines[i + 1].trim();
            if (nextLine.match(/^#\s*Proxy\s+Mode:/i) ||
                nextLine.match(/^tproxy-port/) ||
                nextLine.match(/^tun:/)) {
                continue;
            }
        }

        if (trimmed.match(/^tproxy-port:/)) {
            continue;
        }

        if (trimmed.match(/^tun:/)) {
            inTunSection = true;
            tunIndentLevel = line.search(/\S/);
            continue;
        }

        if (inTunSection) {
            const currentIndent = line.search(/\S/);
            if (line.trim() === '' ||
                line.trim().startsWith('#') ||
                (currentIndent > tunIndentLevel && line.trim() !== '')) {
                continue;
            } else {
                inTunSection = false;
            }
        }

        newLines.push(line);
    }

    let insertIndex = 0;
    for (let i = 0; i < newLines.length; i++) {
        if (newLines[i].trim().match(/^mode:/)) {
            insertIndex = i + 1;
            break;
        }
    }

    const normalizedTunStack = ['system', 'gvisor', 'mixed'].includes(tunStack) ? tunStack : 'system';
    let configToInsert = [];
    switch (proxyMode) {
        case 'tproxy':
            configToInsert = [
                '# Proxy Mode: TPROXY',
                'tproxy-port: 7894'
            ];
            break;
        case 'tun':
            configToInsert = [
                '# Proxy Mode: TUN',
                'tun:',
                '  enable: true',
                '  device: clash-tun',
                `  stack: ${normalizedTunStack}`,
                '  auto-route: false',
                '  auto-redirect: false',
                '  auto-detect-interface: false'
            ];
            break;
        case 'mixed':
            configToInsert = [
                '# Proxy Mode: MIXED (TCP via TPROXY port 7894, UDP via TUN)',
                'tproxy-port: 7894',
                'tun:',
                '  enable: true',
                '  device: clash-tun',
                `  stack: ${normalizedTunStack}`,
                '  auto-route: false',
                '  auto-redirect: false',
                '  auto-detect-interface: false'
            ];
            break;
    }

    newLines.splice(insertIndex, 0, ...configToInsert);
    return newLines.join('\n');
}

async function detectCurrentProxyMode() {
    try {
        const configContent = await L.resolveDefault(fs.read('/opt/clash/config.yaml'), '');
        if (!configContent) return 'tproxy';

        const lines = configContent.split('\n');
        let hasTproxy = false;
        let hasTun = false;

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.match(/^tproxy-port:/) && !trimmed.startsWith('#')) {
                hasTproxy = true;
            }
            if (trimmed.match(/^tun:/)) {
                const tunIndex = lines.indexOf(line);
                for (let i = tunIndex + 1; i < Math.min(tunIndex + 10, lines.length); i++) {
                    const nextLine = lines[i].trim();
                    if (nextLine.match(/^enable:\s*true/)) {
                        hasTun = true;
                        break;
                    }
                    if (nextLine.match(/^[a-zA-Z]/) && !nextLine.startsWith('#')) {
                        break;
                    }
                }
            }
        }

        if (hasTproxy && hasTun) return 'mixed';
        if (hasTun) return 'tun';
        if (hasTproxy) return 'tproxy';
        return 'tproxy';
    } catch (e) {
        console.error('Failed to detect proxy mode:', e);
        return 'tproxy';
    }
}

// =============================================================================
// SECTION: Settings persistence — read/write /opt/clash/settings
// =============================================================================

async function loadSettings() {
    try {
        const content = await L.resolveDefault(fs.read('/opt/clash/settings'), '');
        const settings = {
            mode: 'exclude',
            proxyMode: '',
            tunStack: 'system',
            autoDetectLan: true,
            autoDetectWan: true,
            blockQuic: true,
            useTmpfsRules: true,
            detectedLan: '',
            detectedWan: '',
            includedInterfaces: [],
            excludedInterfaces: [],
            enableHwid: false,
            hwidUserAgent: 'SSClash',
            hwidDeviceOS: 'OpenWrt'
        };

        content.split('\n').forEach(line => {
            const eqIdx = line.indexOf('=');
            if (eqIdx === -1) return;
            const key = line.slice(0, eqIdx).trim();
            const value = line.slice(eqIdx + 1).trim();
            if (!key) return;
            switch(key) {
                case 'INTERFACE_MODE': settings.mode = value; break;
                case 'PROXY_MODE': settings.proxyMode = value; break;
                case 'TUN_STACK': settings.tunStack = value || 'system'; break;
                case 'AUTO_DETECT_LAN': settings.autoDetectLan = value === 'true'; break;
                case 'AUTO_DETECT_WAN': settings.autoDetectWan = value === 'true'; break;
                case 'BLOCK_QUIC': settings.blockQuic = value === 'true'; break;
                case 'USE_TMPFS_RULES': settings.useTmpfsRules = value === 'true'; break;
                case 'DETECTED_LAN': settings.detectedLan = value; break;
                case 'DETECTED_WAN': settings.detectedWan = value; break;
                case 'INCLUDED_INTERFACES':
                    settings.includedInterfaces = value ? value.split(',').map(i => i.trim()) : [];
                    break;
                case 'EXCLUDED_INTERFACES':
                    settings.excludedInterfaces = value ? value.split(',').map(i => i.trim()) : [];
                    break;
                case 'ENABLE_HWID':
                    settings.enableHwid = value === 'true';
                    break;
                case 'HWID_USER_AGENT':
                    settings.hwidUserAgent = value;
                    break;
                case 'HWID_DEVICE_OS':
                    settings.hwidDeviceOS = value;
                    break;
            }
        });

        return settings;
    } catch (e) {
        return {
            mode: 'exclude',
            proxyMode: '',
            tunStack: 'system',
            autoDetectLan: true,
            autoDetectWan: true,
            blockQuic: true,
            useTmpfsRules: true,
            detectedLan: '',
            detectedWan: '',
            includedInterfaces: [],
            excludedInterfaces: [],
            enableHwid: false,
            hwidUserAgent: 'SSClash',
            hwidDeviceOS: 'OpenWrt'
        };
    }
}

async function loadInterfacesByMode(mode) {
    try {
        const settings = await loadSettings();
        const manualList = mode === 'explicit' ? settings.includedInterfaces : settings.excludedInterfaces;
        const detectedInterface = mode === 'explicit' ? settings.detectedLan : settings.detectedWan;

        const allInterfaces = [...manualList];
        if (detectedInterface && !allInterfaces.includes(detectedInterface)) {
            allInterfaces.push(detectedInterface);
        }

        return allInterfaces;
    } catch (e) {
        return [];
    }
}

async function saveSettings(mode, proxyMode, tunStack, autoDetectLan, autoDetectWan, blockQuic, useTmpfsRules, interfaces, enableHwid, hwidUserAgent, hwidDeviceOS) {
    try {
        let detectedLan = '';
        let detectedWan = '';

        if (autoDetectLan) {
            detectedLan = await detectLanBridge() || '';
        }

        if (autoDetectWan) {
            detectedWan = await detectWanInterface() || '';
        }

        let cleanInterfaces = interfaces.slice();

        if (mode === 'explicit' && autoDetectLan && detectedLan) {
            cleanInterfaces = cleanInterfaces.filter(iface => iface !== detectedLan);
        } else if (mode === 'exclude' && autoDetectWan && detectedWan) {
            cleanInterfaces = cleanInterfaces.filter(iface => iface !== detectedWan);
        }

        const includedInterfaces = mode === 'explicit' ? cleanInterfaces : [];
        const excludedInterfaces = mode === 'exclude' ? cleanInterfaces : [];

        const settingsContent = `INTERFACE_MODE=${mode}
PROXY_MODE=${proxyMode}
TUN_STACK=${tunStack}
AUTO_DETECT_LAN=${autoDetectLan}
AUTO_DETECT_WAN=${autoDetectWan}
BLOCK_QUIC=${blockQuic}
USE_TMPFS_RULES=${useTmpfsRules}
DETECTED_LAN=${detectedLan}
DETECTED_WAN=${detectedWan}
INCLUDED_INTERFACES=${includedInterfaces.join(',')}
EXCLUDED_INTERFACES=${excludedInterfaces.join(',')}
ENABLE_HWID=${enableHwid}
HWID_USER_AGENT=${hwidUserAgent}
HWID_DEVICE_OS=${hwidDeviceOS}
`;

        await fs.write('/opt/clash/settings', settingsContent);

        const configContent = await L.resolveDefault(fs.read('/opt/clash/config.yaml'), '');
        if (configContent) {
            let updatedConfig = transformProxyMode(configContent, proxyMode, tunStack);

            if (enableHwid) {
                const hwidValues = await getHwidValues();
                updatedConfig = addHwidToYaml(
                    updatedConfig,
                    hwidUserAgent,
                    hwidDeviceOS,
                    hwidValues.hwid,
                    hwidValues.verOs,
                    hwidValues.deviceModel
                );
            }

            await fs.write('/opt/clash/config.yaml', updatedConfig);
        }

        ui.addNotification(null, E('p', _('Settings saved. Please restart the Clash service for changes to take effect.')), 'info');
        return true;
    } catch (e) {
        ui.addNotification(null, E('p', _('Failed to save settings: %s').format(e.message)), 'error');
        return false;
    }
}

// =============================================================================
// SECTION: System detection — LAN/WAN interfaces and CPU architecture
// =============================================================================

async function detectLanBridge() {
    try {
        try {
            const networks = await network.getNetworks();
            for (const net of networks) {
                if (net.getName() === 'lan') {
                    const device = net.getL3Device();
                    if (device && device.getName() && device.isUp()) {
                        return device.getName();
                    }
                }
            }
        } catch (e) {
            console.warn('UCI network detection failed, using fallback:', e.message);
        }

        try {
            const ipResult = await fs.exec('ip', ['addr', 'show']);
            if (ipResult.code === 0 && ipResult.stdout) {
                const lines = ipResult.stdout.split('\n');
                let currentInterface = '';

                for (const line of lines) {
                    const ifaceMatch = line.match(/^\d+:\s+([^:@]+):/);
                    if (ifaceMatch) {
                        currentInterface = ifaceMatch[1];
                        continue;
                    }

                    const ipMatch = line.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);
                    if (ipMatch && currentInterface && currentInterface !== 'lo') {
                        const ip = ipMatch[1];
                        if (ip.match(/^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[01])\./)) {
                            if (currentInterface.match(/^(br-|bridge)/) ||
                                currentInterface === 'lan') {
                                return currentInterface;
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Failed to detect LAN bridge via ip command:', e);
        }

        return null;
    } catch (e) {
        console.error(_('Failed to detect LAN bridge:'), e);
        return null;
    }
}

async function detectWanInterface() {
    try {
        try {
            const networks = await network.getNetworks();
            for (const net of networks) {
                if (net.getName() === 'wan' || net.getName() === 'wan6') {
                    const device = net.getL3Device();
                    if (device && device.getName()) {
                        return device.getName();
                    }
                }
            }
        } catch (e) {
            console.warn('UCI WAN detection failed, using fallback:', e.message);
        }

        try {
            const routeContent = await L.resolveDefault(fs.read('/proc/net/route'), '');
            const lines = routeContent.split('\n');
            for (const line of lines) {
                const fields = line.split('\t');
                if (fields[1] === '00000000' && fields[0] !== 'Iface') {
                    return fields[0];
                }
            }
        } catch (e) {
            console.error(_('Failed to read route table:'), e);
        }

        return null;
    } catch (e) {
        console.error(_('Failed to detect WAN interface:'), e);
        return null;
    }
}

async function detectSystemArchitecture() {
    try {
        const releaseInfo = await L.resolveDefault(fs.read('/etc/openwrt_release'), null);
        let distribArch = '';

        if (releaseInfo) {
            const match = releaseInfo.match(/^DISTRIB_ARCH='([^']*)'/m);
            if (match && match[1]) {
                distribArch = match[1];
            }
        }

        if (distribArch) {
            if (distribArch.startsWith('aarch64_')) return 'arm64';
            if (distribArch === 'x86_64') return 'amd64';
            if (distribArch.startsWith('i386_')) return '386';
            if (distribArch.startsWith('riscv64_')) return 'riscv64';
            if (distribArch.startsWith('loongarch64_')) return 'loong64';

            if (distribArch.includes('_neon-vfp')) return 'armv7';
            if (distribArch.includes('_neon') || distribArch.includes('_vfp')) return 'armv6';
            if (distribArch.startsWith('arm_')) return 'armv5';

            if (distribArch.startsWith('mips64el_')) return 'mips64le';
            if (distribArch.startsWith('mips64_')) return 'mips64';
            if (distribArch.startsWith('mipsel_')) {
                if (distribArch.includes('hardfloat')) return 'mipsle-hardfloat';
                return 'mipsle-softfloat';
            }
            if (distribArch.startsWith('mips_')) {
                if (distribArch.includes('hardfloat')) return 'mips-hardfloat';
                return 'mips-softfloat';
            }
        }
    } catch (e) {
        console.error('Failed to read /etc/openwrt_release or parse architecture.', e.message);
    }

    ui.addNotification(null, E('p', 'Could not determine system architecture from /etc/openwrt_release. This might not be a standard OpenWrt system. Falling back to default: amd64.'), 'error');
    return 'amd64';
}

// =============================================================================
// SECTION: Mihomo kernel management — version check, download
// =============================================================================

async function getLatestMihomoRelease() {
    try {
        const response = await fetch('https://api.github.com/repos/MetaCubeX/mihomo/releases/latest');
        if (!response.ok) {
            throw new Error(_('HTTP %d: %s').format(response.status, response.statusText));
        }
        const data = await response.json();
        if (data.prerelease) {
            throw new Error(_('Latest release is a pre-release'));
        }
        return { version: data.tag_name, assets: data.assets };
    } catch (e) {
        console.error(_('Failed to get latest release:'), e);
        return null;
    }
}

function normalizeVersion(str) {
    if (!str) return '';
    const match = str.match(/v?(\d+\.\d+\.\d+)/);
    return match ? match[1] : str.trim();
}

async function getMihomoStatus() {
    try {
        const binPath = '/opt/clash/bin/clash';
        const stat = await L.resolveDefault(fs.stat(binPath), null);
        if (!stat) {
            return { installed: false, version: null };
        }

        try {
            const result = await fs.exec(binPath, ['-v']);
            let output = '';
            if (result && typeof result === 'object') {
                output = result.stdout || result.stderr || '';
            } else if (typeof result === 'string') {
                output = result;
            }

            if (output && output.trim()) {
                const patterns = [
                    /Mihomo\s+Meta\s+(v[\d\.]+)/i,
                    /Mihomo\s+[^v]*?(v[\d\.]+)/i,
                    /(v\d+\.\d+\.\d+)/i
                ];

                for (const pattern of patterns) {
                    const match = output.match(pattern);
                    if (match && match[1]) {
                        return { installed: true, version: match[1] };
                    }
                }

                if (output.toLowerCase().includes('mihomo')) {
                    const firstLine = output.split('\n')[0].trim();
                    if (firstLine.length < 100) {
                        return { installed: true, version: firstLine };
                    }
                    return { installed: true, version: _('Mihomo (version detected)') };
                }
            }
        } catch (execError) {}

        const size = Math.round(stat.size / 1024 / 1024);
        return { installed: true, version: _('Installed (%dMB)').format(size) };
    } catch (e) {
        return { installed: false, version: null };
    }
}

async function downloadMihomoKernel(downloadUrl, version, arch) {
    try {
        ui.addNotification(null, E('p', _('Downloading mihomo kernel...')), 'info');

        const fileName = `mihomo-linux-${arch}-${version}.gz`;
        const downloadPath = `/tmp/${fileName}`;

        const curlResult = await fs.exec('curl', ['-L', downloadUrl, '-o', downloadPath]);
        if (curlResult.code !== 0) throw new Error(_('Download failed'));

        const extractResult = await fs.exec('gzip', ['-d', downloadPath]);
        if (extractResult.code !== 0) throw new Error(_('Extraction failed'));

        const extractedFile = downloadPath.replace('.gz', '');
        const targetFile = '/opt/clash/bin/clash';

        await fs.exec('mv', [extractedFile, targetFile]);
        await fs.exec('chmod', ['+x', targetFile]);

        ui.addNotification(null, E('p', _('Mihomo kernel downloaded and installed successfully!')), 'info');
        return true;
    } catch (e) {
        ui.addNotification(null, E('p', _('Failed to download mihomo kernel: %s').format(e.message)), 'error');
        return false;
    }
}

let updateKernelStatusFn = null;

function createKernelDownloadSection() {
    const container = E('div', { 'class': 'cbi-section' });

    container.appendChild(E('h2', _('Mihomo Kernel Management')));
    container.appendChild(E('div', { 'class': 'cbi-section-descr' },
        _('Download and manage the Mihomo (Clash Meta) kernel binary.')));

    const statusContainer = E('div', {
        'id': 'kernel-status',
        'style': 'margin: 15px 0; padding: 12px; border: 1px solid #ddd; border-radius: 4px; background: #f9f9f9;'
    });

    container.appendChild(statusContainer);

    async function updateKernelStatus() {
        const statusElement = document.getElementById('kernel-status');
        const downloadButton = document.getElementById('download-kernel-btn');
        if (downloadButton) {
            downloadButton.disabled = true;
            downloadButton.textContent = _('Checking...');
        }

        try {
            const [status, arch, release] = await Promise.all([
                getMihomoStatus(),
                detectSystemArchitecture(),
                getLatestMihomoRelease()
            ]);

            let statusHTML = '';
            if (status.installed) {
                statusHTML += `<div style="color: #28a745; font-weight: bold;">✅ ${_('Kernel Status')}: ${_('Installed')}</div>`;
                statusHTML += `<div style="margin-top: 5px;">📦 ${_('Version')}: ${status.version}</div>`;
            } else {
                statusHTML += `<div style="color: #dc3545; font-weight: bold;">❌ ${_('Kernel Status')}: ${_('Not Installed')}</div>`;
                statusHTML += `<div style="margin-top: 5px; color: #666;">${_('Mihomo kernel binary not found')}</div>`;
            }

            statusHTML += `<div style="margin-top: 5px;">🏗️ ${_('System Architecture')}: ${arch}</div>`;

            if (release) {
                if (downloadButton) downloadButton.disabled = false;

                statusHTML += `<div style="margin-top: 5px;">🚀 ${_('Latest Available')}: ${release.version}</div>`;

                const localVer = normalizeVersion(status.version);
                const latestVer = normalizeVersion(release.version);

                if (status.installed && localVer !== latestVer) {
                    statusHTML += `<div style="margin-top: 5px; color: #ffc107; font-weight: bold;">⚠️ ${_('Update Available')}</div>`;
                    if (downloadButton) downloadButton.textContent = _('Download Update');
                } else if (status.installed) {
                    statusHTML += `<div style="margin-top: 5px; color: #28a745;">✨ ${_('Kernel is up to date')}</div>`;
                    if (downloadButton) downloadButton.textContent = _('Reinstall Kernel');
                } else {
                    if (downloadButton) downloadButton.textContent = _('Download Latest Kernel');
                }
            } else {
                statusHTML += `<div style="margin-top: 5px; color: #dc3545;">❌ ${_('Failed to check latest version')}</div>`;
                if (downloadButton) {
                    downloadButton.disabled = true;
                    if (status.installed) {
                        downloadButton.textContent = _('Reinstall Kernel');
                    } else {
                        downloadButton.textContent = _('Download Latest Kernel');
                    }
                }
            }

            statusElement.innerHTML = statusHTML;
        } catch (e) {
            statusElement.innerHTML = `<div style="color: #dc3545;">❌ ${_('Error checking status')}: ${e.message}</div>`;
            if (downloadButton) {
                downloadButton.disabled = true;
                downloadButton.textContent = _('Download Latest Kernel');
            }
            console.error(_('Failed to update kernel status:'), e);
        }
    }

    updateKernelStatusFn = updateKernelStatus;
    setTimeout(updateKernelStatus, 100);

    return container;
}

// =============================================================================
// SECTION: UI component builders
// =============================================================================

function createModeSelector(currentMode) {
    const container = E('div', { 'class': 'cbi-section' });

    container.appendChild(E('h2', _('Interface Processing Mode')));
    container.appendChild(E('div', { 'class': 'cbi-section-descr' },
        _('Choose how to handle network interfaces for proxy processing.')));

    const modeContainer = E('div', { 'style': 'margin: 15px 0;' });

    const excludeRadio = E('input', {
        'type': 'radio', 'id': 'mode_exclude', 'name': 'interface_mode', 'value': 'exclude'
    });

    const excludeLabel = E('label', {
        'for': 'mode_exclude',
        'style': 'display: block; padding: 12px; border: 2px solid #ddd; border-radius: 6px; margin-bottom: 10px; cursor: pointer; background: white;'
    }, [
        E('div', { 'style': 'display: flex; align-items: flex-start; gap: 10px;' }, [
            excludeRadio,
            E('div', {}, [
                E('strong', { 'style': 'display: block; margin-bottom: 5px;' },
                    '⭕ ' + _('Exclude Mode (Universal approach)')),
                E('div', { 'style': 'color: #666; font-size: 13px; line-height: 1.4;' },
                    _('Process traffic from ALL interfaces except selected ones. Automatically detects and excludes WAN. Recommended for most users.'))
            ])
        ])
    ]);

    const explicitRadio = E('input', {
        'type': 'radio', 'id': 'mode_explicit', 'name': 'interface_mode', 'value': 'explicit'
    });

    const explicitLabel = E('label', {
        'for': 'mode_explicit',
        'style': 'display: block; padding: 12px; border: 2px solid #ddd; border-radius: 6px; cursor: pointer; background: white;'
    }, [
        E('div', { 'style': 'display: flex; align-items: flex-start; gap: 10px;' }, [
            explicitRadio,
            E('div', {}, [
                E('strong', { 'style': 'display: block; margin-bottom: 5px;' },
                    '🎯 ' + _('Explicit Mode (Precise control)')),
                E('div', { 'style': 'color: #666; font-size: 13px; line-height: 1.4;' },
                    _('Process traffic ONLY from selected interfaces. More secure but requires manual configuration. Recommended for advanced users.'))
            ])
        ])
    ]);

    setTimeout(() => {
        if (currentMode === 'explicit') {
            explicitRadio.checked = true;
        } else {
            excludeRadio.checked = true;
        }
        updateLabels();
    }, 0);

    function updateLabels() {
        if (excludeRadio.checked) {
            excludeLabel.style.borderColor = '#0066cc';
            excludeLabel.style.backgroundColor = '#f0f8ff';
            explicitLabel.style.borderColor = '#ddd';
            explicitLabel.style.backgroundColor = 'white';
        } else if (explicitRadio.checked) {
            explicitLabel.style.borderColor = '#0066cc';
            explicitLabel.style.backgroundColor = '#f0f8ff';
            excludeLabel.style.borderColor = '#ddd';
            excludeLabel.style.backgroundColor = 'white';
        }
    }

    excludeRadio.addEventListener('change', updateLabels);
    explicitRadio.addEventListener('change', updateLabels);

    modeContainer.appendChild(excludeLabel);
    modeContainer.appendChild(explicitLabel);
    container.appendChild(modeContainer);

    return container;
}

function createProxyModeSection(currentProxyMode) {
    const container = E('div', { 'class': 'cbi-section' });

    container.appendChild(E('h3', _('Proxy Mode')));
    container.appendChild(E('div', { 'class': 'cbi-section-descr' },
        _('Choose how traffic is redirected to Clash: TPROXY (all traffic), TUN (all traffic via virtual interface), or MIXED (TCP via TPROXY, UDP via TUN — best for gaming).')
    ));

    const fieldContainer = E('div', { 'style': 'margin: 10px 0;' });

    const select = E('select', {
        'class': 'cbi-input-select',
        'id': 'proxy-mode-select'
    }, [
        E('option', { 'value': 'tproxy' }, 'TPROXY'),
        E('option', { 'value': 'tun' }, 'TUN'),
        E('option', { 'value': 'mixed' }, 'MIXED (TCP+UDP)')
    ]);

    const descriptionsDiv = E('div', {}, [
        E('div', {
            'id': 'tproxy-desc',
            'style': 'display: none; margin-top: 8px; padding: 10px; background: #f0f8ff; border-left: 3px solid #0066cc; border-radius: 3px; font-size: 12px;'
        }, [
            E('strong', 'TPROXY: '),
            _('Transparent proxy mode. Routes both TCP and UDP through TPROXY port 7894. Best compatibility, requires kernel TPROXY support.')
        ]),
        E('div', {
            'id': 'tun-desc',
            'style': 'display: none; margin-top: 8px; padding: 10px; background: #f0fff0; border-left: 3px solid #00cc00; border-radius: 3px; font-size: 12px;'
        }, [
            E('strong', 'TUN: '),
            _('TUN interface mode. Creates virtual network interface for all traffic. Better performance, works without TPROXY. Requires TUN kernel module.')
        ]),
        E('div', {
            'id': 'mixed-desc',
            'style': 'display: none; margin-top: 8px; padding: 10px; background: #fff8f0; border-left: 3px solid #ff9900; border-radius: 3px; font-size: 12px;'
        }, [
            E('strong', 'MIXED: '),
            _('Hybrid mode (best for gaming). TCP via TPROXY (stable), UDP via TUN (low latency). Optimal for online games requiring fast UDP.')
        ])
    ]);

    fieldContainer.appendChild(select);
    fieldContainer.appendChild(descriptionsDiv);
    container.appendChild(fieldContainer);

    setTimeout(function() {
        select.value = currentProxyMode || 'tproxy';
        select.dispatchEvent(new Event('change'));
    }, 0);

    select.addEventListener('change', function() {
        const selectedMode = this.value;
        document.getElementById('tproxy-desc').style.display = selectedMode === 'tproxy' ? 'block' : 'none';
        document.getElementById('tun-desc').style.display = selectedMode === 'tun' ? 'block' : 'none';
        document.getElementById('mixed-desc').style.display = selectedMode === 'mixed' ? 'block' : 'none';
    });

    return container;
}

function createTunStackSection(currentTunStack) {
    const container = E('div', {
        'id': 'tun-stack-container',
        'class': 'cbi-section'
    });

    container.appendChild(E('h3', _('TUN Stack')));
    container.appendChild(E('div', { 'class': 'cbi-section-descr' },
        _('Choose Mihomo TUN stack. `system` is fastest but depends on kernel capabilities; `gvisor` is more compatible; `mixed` combines both.')
    ));

    const select = E('select', {
        'class': 'cbi-input-select',
        'id': 'tun-stack-select'
    }, [
        E('option', { 'value': 'system' }, 'system'),
        E('option', { 'value': 'gvisor' }, 'gvisor'),
        E('option', { 'value': 'mixed' }, 'mixed')
    ]);

    const hint = E('div', {
        'id': 'tun-stack-hint',
        'style': 'margin-top: 8px; padding: 8px; background: #f9f9f9; border-left: 3px solid #777; border-radius: 3px; font-size: 12px; color: #444;'
    });

    function updateHint() {
        const value = select.value;
        if (value === 'system') {
            hint.textContent = _('system: kernel network stack. If TCP in TUN fails on your device, try gvisor.');
            hint.style.borderLeftColor = '#0066cc';
        } else if (value === 'gvisor') {
            hint.textContent = _('gvisor: userspace stack, usually most compatible across routers.');
            hint.style.borderLeftColor = '#28a745';
        } else {
            hint.textContent = _('mixed: hybrid stack mode supported by some Mihomo builds.');
            hint.style.borderLeftColor = '#ff9900';
        }
    }

    const effectiveStack = ['system', 'gvisor', 'mixed'].includes(currentTunStack) ? currentTunStack : 'system';
    setTimeout(() => {
        select.value = effectiveStack;
        updateHint();
    }, 0);
    select.addEventListener('change', updateHint);

    container.appendChild(E('div', { 'style': 'margin: 10px 0;' }, [select, hint]));
    return container;
}

function createAutoDetectOptions(currentMode, autoDetectLan, autoDetectWan) {
    const container = E('div', {
        'id': 'auto-detect-container',
        'class': 'cbi-section'
    });

    container.appendChild(E('h3', _('Automatic Interface Detection')));

    const optionsContainer = E('div', { 'style': 'display: grid; gap: 10px;' });

    const lanContainer = E('div', {
        'id': 'auto-detect-lan-container',
        'style': currentMode === 'exclude' ? 'display: none;' : 'display: block;'
    });

    const autoDetectLanCheckbox = E('input', {
        'type': 'checkbox',
        'id': 'auto_detect_lan'
    });

    const autoDetectLanLabel = E('label', {
        'for': 'auto_detect_lan',
        'style': 'display: flex; align-items: center; gap: 8px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; background: #f9f9f9; cursor: pointer;'
    }, [
        autoDetectLanCheckbox,
        E('span', '🔍 ' + _('Automatically detect LAN bridge interface'))
    ]);

    lanContainer.appendChild(autoDetectLanLabel);
    lanContainer.appendChild(E('div', { 'class': 'cbi-section-descr', 'style': 'margin-top: 5px; font-size: 12px;' },
        _('When enabled, automatically finds the main LAN bridge. Disable to manually select specific interfaces.')));

    const wanContainer = E('div', {
        'id': 'auto-detect-wan-container',
        'style': currentMode === 'explicit' ? 'display: none;' : 'display: block;'
    });

    const autoDetectWanCheckbox = E('input', {
        'type': 'checkbox',
        'id': 'auto_detect_wan'
    });

    const autoDetectWanLabel = E('label', {
        'for': 'auto_detect_wan',
        'style': 'display: flex; align-items: center; gap: 8px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; background: #f9f9f9; cursor: pointer;'
    }, [
        autoDetectWanCheckbox,
        E('span', '🔍 ' + _('Automatically detect WAN interface'))
    ]);

    wanContainer.appendChild(autoDetectWanLabel);
    wanContainer.appendChild(E('div', { 'class': 'cbi-section-descr', 'style': 'margin-top: 5px; font-size: 12px;' },
        _('When enabled, automatically detects and excludes WAN interface. Disable to manually select interfaces to exclude.')));

    optionsContainer.appendChild(lanContainer);
    optionsContainer.appendChild(wanContainer);
    container.appendChild(optionsContainer);

    setTimeout(() => {
        autoDetectLanCheckbox.checked = autoDetectLan;
        autoDetectWanCheckbox.checked = autoDetectWan;
    }, 0);

    async function handleAutoDetectChange(isChecked, type) {
        if (isChecked) return;

        try {
            const settings = await loadSettings();
            const detectedInterfaceName = (type === 'lan') ? settings.detectedLan : settings.detectedWan;

            if (detectedInterfaceName) {
                const checkbox = document.getElementById('iface_' + detectedInterfaceName);
                if (checkbox && checkbox.checked) {
                    checkbox.checked = false;
                    const label = checkbox.nextElementSibling;
                    label.style.borderColor = '#ccc';
                    label.style.backgroundColor = 'white';

                    const autoIndicator = label.querySelector('.auto-indicator');
                    if (autoIndicator) {
                        autoIndicator.remove();
                    }
                }
            }
        } catch (e) {
            console.error(`Failed to uncheck detected ${type} interface:`, e);
        }
    }

    autoDetectLanCheckbox.addEventListener('change', function() {
        handleAutoDetectChange(this.checked, 'lan');
    });

    autoDetectWanCheckbox.addEventListener('change', function() {
        handleAutoDetectChange(this.checked, 'wan');
    });

    return container;
}

function createInterfaceSelector(interfaces, selectedInterfaces, currentMode) {
    const container = E('div', {
        'id': 'interface-selector',
        'class': 'cbi-section'
    });

    const title = currentMode === 'explicit'
        ? _('Select interfaces to process')
        : _('Select interfaces to exclude');

    const description = currentMode === 'explicit'
        ? _('Traffic from these interfaces will be processed by the proxy.')
        : _('Traffic from these interfaces will bypass the proxy (direct routing).');

    container.appendChild(E('h3', title));
    container.appendChild(E('div', { 'class': 'cbi-section-descr' }, description));

    const groupedInterfaces = {};
    const categoryNames = {
        'wan': _('WAN Interfaces'),
        'ethernet': _('Ethernet Interfaces'),
        'wifi': _('WiFi Interfaces'),
        'usb': _('USB Interfaces'),
        'vpn': _('VPN Interfaces'),
        'virtual': _('Virtual Interfaces'),
        'other': _('Other Interfaces')
    };

    interfaces.forEach(function(iface) {
        if (!groupedInterfaces[iface.category]) {
            groupedInterfaces[iface.category] = [];
        }
        groupedInterfaces[iface.category].push(iface);
    });

    const mainContainer = E('div', { 'style': 'margin: 15px 0;' });

    function updateLabelStyle(checkbox, label, ifaceName, detectedInterface) {
        const isAutoDetected = ifaceName === detectedInterface;
        if (isAutoDetected) {
            label.style.borderColor = '#28a745';
            label.style.backgroundColor = '#f8fff8';
        } else if (checkbox.checked) {
            label.style.borderColor = '#0066cc';
            label.style.backgroundColor = '#e6f3ff';
        } else {
            label.style.borderColor = '#ccc';
            label.style.backgroundColor = 'white';
        }
    }

    loadSettings().then(function(settings) {
        const autoDetectEnabled = currentMode === 'explicit' ? settings.autoDetectLan : settings.autoDetectWan;
        const detectedInterface = autoDetectEnabled
            ? (currentMode === 'explicit' ? settings.detectedLan : settings.detectedWan)
            : null;

        Object.keys(groupedInterfaces).forEach(function(category) {
            if (groupedInterfaces[category].length === 0) return;

            const groupContainer = E('div', {
                'class': 'cbi-section',
                'style': 'margin-bottom: 5px; border: 1px solid #ddd; border-radius: 4px; padding: 0 8px 8px 8px; background-color: #f9f9f9;'
            });

            const groupTitle = E('h4', {
                'style': 'color: #555; font-size: 13px;'
            }, categoryNames[category] || category);

            groupContainer.appendChild(groupTitle);

            const interfaceGrid = E('div', {
                'style': 'display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 6px;'
            });
            groupedInterfaces[category].forEach(function(iface) {
                const isChecked = selectedInterfaces.includes(iface.name);

                const checkbox = E('input', {
                    'type': 'checkbox',
                    'id': 'iface_' + iface.name,
                    'value': iface.name,
                    'style': 'position: absolute; left: 6px; top: 50%; transform: translateY(-50%); z-index: 2; margin: 0; vertical-align: middle;'
                });

                const label = E('label', {
                    'for': 'iface_' + iface.name,
                    'style': 'display: flex; align-items: center; padding: 6px 6px 6px 24px; border: 1px solid #ccc; border-radius: 3px; cursor: pointer; background-color: white; transition: all 0.15s ease; font-size: 13px; min-height: 32px; position: relative; line-height: 1.2;'
                }, [
                    E('span', { 'style': 'margin-right: 6px; font-size: 14px; flex-shrink: 0;' }, iface.icon),
                    E('span', { 'style': 'font-weight: 500; flex-grow: 1;' }, iface.description)
                ]);

                const wrapper = E('div', { 'style': 'position: relative;' }, [checkbox, label]);

                checkbox.checked = isChecked;
                updateLabelStyle(checkbox, label, iface.name, detectedInterface);

                if (iface.name === detectedInterface) {
                    const autoIndicator = E('span', {
                        'class': 'auto-indicator',
                        'style': 'margin-left: 4px; font-size: 10px; color: #28a745; font-weight: bold;'
                    }, '● ' + _('AUTO'));
                    label.appendChild(autoIndicator);
                }

                checkbox.addEventListener('change', function() {
                    updateLabelStyle(this, label, iface.name, detectedInterface);
                });

                label.addEventListener('mouseover', function() {
                    if (iface.name === detectedInterface) {
                        this.style.backgroundColor = '#f0fff0';
                    } else if (!checkbox.checked) {
                        this.style.borderColor = '#0066cc';
                        this.style.backgroundColor = '#f0f8ff';
                    }
                });

                label.addEventListener('mouseout', function() {
                    updateLabelStyle(checkbox, label, iface.name, detectedInterface);
                });

                interfaceGrid.appendChild(wrapper);
            });

            groupContainer.appendChild(interfaceGrid);
            mainContainer.appendChild(groupContainer);
        });
    });

    container.appendChild(mainContainer);
    return container;
}

function createAdditionalSettings(blockQuic, useTmpfsRules, enableHwid, hwidUserAgent, hwidDeviceOS) {
    const container = E('div', { 'class': 'cbi-section' });

    container.appendChild(E('h3', _('Additional Settings')));

    const settingsContainer = E('div', { 'style': 'display: grid; gap: 10px; margin: 15px 0;' });

    const blockQuicCheckbox = E('input', {
        'type': 'checkbox',
        'id': 'block_quic'
    });

    const blockQuicLabel = E('label', {
        'for': 'block_quic',
        'style': 'display: flex; align-items: center; gap: 8px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; background: #f9f9f9; cursor: pointer;'
    }, [
        blockQuicCheckbox,
        E('span', '🚫 ' + _('Block QUIC traffic (UDP port 443)'))
    ]);

    settingsContainer.appendChild(blockQuicLabel);
    settingsContainer.appendChild(E('div', { 'class': 'cbi-section-descr', 'style': 'font-size: 12px;' },
        _('When enabled, blocks QUIC traffic on UDP port 443. This can improve proxy effectiveness for some services like YouTube.')));

    const tmpfsCheckbox = E('input', {
        'type': 'checkbox',
        'id': 'use_tmpfs_rules'
    });

    const tmpfsLabel = E('label', {
        'for': 'use_tmpfs_rules',
        'style': 'display: flex; align-items: center; gap: 8px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; background: #f9f9f9; cursor: pointer;'
    }, [
        tmpfsCheckbox,
        E('span', '💾 ' + _('Store rules and proxy providers in RAM (tmpfs)'))
    ]);

    settingsContainer.appendChild(tmpfsLabel);
    settingsContainer.appendChild(E('div', { 'class': 'cbi-section-descr', 'style': 'font-size: 12px;' },
        _('When enabled, rulesets and proxy-providers directories are placed on tmpfs for faster access (at the cost of using RAM). Disable to keep them on persistent storage.')));

    setTimeout(() => {
        blockQuicCheckbox.checked = blockQuic;
        tmpfsCheckbox.checked = useTmpfsRules;
    }, 0);

    const hwidCheckbox = E('input', {
        'type': 'checkbox',
        'id': 'enable_hwid'
    });

    const hwidLabel = E('label', {
        'for': 'enable_hwid',
        'style': 'display: flex; align-items: center; gap: 8px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; background: #f9f9f9; cursor: pointer;'
    }, [
        hwidCheckbox,
        E('span', '🔑 ' + _('Add HWID headers to subscriptions'))
    ]);

    settingsContainer.appendChild(hwidLabel);
    settingsContainer.appendChild(E('div', { 'class': 'cbi-section-descr', 'style': 'font-size: 12px; margin-bottom: 10px;' },
        _('Automatically adds HWID headers to proxy-providers for device tracking (Remnawave compatibility).')));

    const hwidAdvancedContainer = E('div', {
        'id': 'hwid_advanced',
        'style': 'display: none; padding: 10px; border: 1px solid #ddd; border-radius: 4px; background: #fff;'
    });

    const userAgentContainer = E('div', {
        'style': 'margin-bottom: 15px;'
    });
    const userAgentLabel = E('label', {
        'for': 'hwid_user_agent',
        'style': 'display: block; font-weight: bold; margin-bottom: 5px;'
    }, _('User-Agent'));
    const userAgentInput = E('input', {
        'type': 'text',
        'id': 'hwid_user_agent',
        'class': 'cbi-input-text',
        'value': hwidUserAgent || 'SSClash',
        'placeholder': 'SSClash'
    });
    const userAgentDesc = E('div', {
        'style': 'font-size: 11px; color: #666; margin-top: 5px;'
    }, _('Application identifier sent in HTTP headers'));

    userAgentContainer.appendChild(userAgentLabel);
    userAgentContainer.appendChild(userAgentInput);
    userAgentContainer.appendChild(userAgentDesc);

    const deviceOsContainer = E('div', {
        'style': 'margin-bottom: 15px;'
    });
    const deviceOsLabel = E('label', {
        'for': 'hwid_device_os',
        'style': 'display: block; font-weight: bold; margin-bottom: 5px;'
    }, _('Device OS'));
    const deviceOsInput = E('input', {
        'type': 'text',
        'id': 'hwid_device_os',
        'class': 'cbi-input-text',
        'value': hwidDeviceOS || 'OpenWrt',
        'placeholder': 'OpenWrt'
    });
    const deviceOsDesc = E('div', {
        'style': 'font-size: 11px; color: #666; margin-top: 5px;'
    }, _('Operating system name sent in headers'));

    deviceOsContainer.appendChild(deviceOsLabel);
    deviceOsContainer.appendChild(deviceOsInput);
    deviceOsContainer.appendChild(deviceOsDesc);

    hwidAdvancedContainer.appendChild(userAgentContainer);
    hwidAdvancedContainer.appendChild(deviceOsContainer);

    settingsContainer.appendChild(hwidAdvancedContainer);

    setTimeout(() => {
        hwidCheckbox.checked = enableHwid;
        if (enableHwid) {
            hwidAdvancedContainer.style.display = 'block';
        }
    }, 0);

    hwidCheckbox.addEventListener('change', function() {
        if (this.checked) {
            hwidAdvancedContainer.style.display = 'block';
        } else {
            hwidAdvancedContainer.style.display = 'none';
        }
    });

    container.appendChild(settingsContainer);
    return container;
}

async function updateInterfaceCheckboxes(newMode) {
    try {
        const settings = await loadSettings();
        const detectedInterface = newMode === 'explicit' ? settings.detectedLan : settings.detectedWan;
        const autoDetectEnabled = newMode === 'explicit' ? settings.autoDetectLan : settings.autoDetectWan;

        const selectedInterfaces = await loadInterfacesByMode(newMode);
        const checkboxes = document.querySelectorAll('#interface-selector input[type="checkbox"]');

        checkboxes.forEach(function(cb) {
            cb.checked = false;
            const label = cb.nextElementSibling;
            label.style.borderColor = '#ccc';
            label.style.backgroundColor = 'white';

            const autoIndicator = label.querySelector('.auto-indicator');
            if (autoIndicator) {
                autoIndicator.remove();
            }
        });

        selectedInterfaces.forEach(function(ifaceName) {
            const checkbox = document.getElementById('iface_' + ifaceName);
            if (checkbox) {
                checkbox.checked = true;
                const label = checkbox.nextElementSibling;

                if (autoDetectEnabled && ifaceName === detectedInterface) {
                    label.style.borderColor = '#28a745';
                    label.style.backgroundColor = '#f8fff8';

                    const autoIndicator = E('span', {
                        'class': 'auto-indicator',
                        'style': 'margin-left: 4px; font-size: 10px; color: #28a745; font-weight: bold;'
                    }, '● ' + _('AUTO'));
                    label.appendChild(autoIndicator);
                } else {
                    label.style.borderColor = '#0066cc';
                    label.style.backgroundColor = '#e6f3ff';
                }
            }
        });

        return selectedInterfaces;
    } catch (e) {
        console.error(_('Failed to update interface checkboxes:'), e);
        return [];
    }
}

async function updateAutoDetectSettings(newMode) {
    try {
        const settings = await loadSettings();

        const lanCheckbox = document.getElementById('auto_detect_lan');
        const wanCheckbox = document.getElementById('auto_detect_wan');
        const quicCheckbox = document.getElementById('block_quic');

        if (lanCheckbox) lanCheckbox.checked = settings.autoDetectLan;
        if (wanCheckbox) wanCheckbox.checked = settings.autoDetectWan;
        if (quicCheckbox) quicCheckbox.checked = settings.blockQuic;

        return settings;
    } catch (e) {
        console.error(_('Failed to update auto detect settings:'), e);
        return { autoDetectLan: true, autoDetectWan: true, blockQuic: true };
    }
}

function getManualInterfaces(allInterfaces, detectedInterface) {
    if (!detectedInterface) return allInterfaces;
    return allInterfaces.filter(iface => iface !== detectedInterface);
}

return view.extend({
    load: function() {
        return Promise.all([
            getNetworkInterfaces(),
            loadSettings()
        ]);
    },

    render: async function(data) {
        const [interfaces, settings] = data;
        const selectedInterfaces = await loadInterfacesByMode(settings.mode);

        let detectedLanBridge = null;
        let detectedWanInterface = null;

        try {
            detectedLanBridge = await detectLanBridge();
            detectedWanInterface = await detectWanInterface();
        } catch (e) {
            console.error(_('Failed to detect interfaces:'), e);
        }

        const modeSelector = createModeSelector(settings.mode);

        const currentProxyMode = settings.proxyMode || await detectCurrentProxyMode();
        const proxyModeSection = createProxyModeSection(currentProxyMode);
        const tunStackSection = createTunStackSection(settings.tunStack || 'system');
        tunStackSection.style.display = (currentProxyMode === 'tun' || currentProxyMode === 'mixed') ? 'block' : 'none';

        const proxyModeSelectForTun = proxyModeSection.querySelector('#proxy-mode-select');

        function updateTunStackVisibility() {
            const mode = proxyModeSelectForTun ? proxyModeSelectForTun.value : 'tproxy';
            tunStackSection.style.display = (mode === 'tun' || mode === 'mixed') ? 'block' : 'none';
        }
        if (proxyModeSelectForTun) {
            proxyModeSelectForTun.addEventListener('change', updateTunStackVisibility);
        }

        const autoDetectOptions = createAutoDetectOptions(settings.mode, settings.autoDetectLan, settings.autoDetectWan);
        const interfaceSelector = createInterfaceSelector(interfaces, selectedInterfaces, settings.mode);
        const additionalSettings = createAdditionalSettings(
            settings.blockQuic,
            settings.useTmpfsRules,
            settings.enableHwid,
            settings.hwidUserAgent,
            settings.hwidDeviceOS
        );
        const kernelDownloadSection = createKernelDownloadSection();

        const downloadButton = E('button', {
            'id': 'download-kernel-btn',
            'class': 'btn',
            'click': async function() {
                this.disabled = true;
                this.textContent = _('Downloading...');

                try {
                    const arch = await detectSystemArchitecture();
                    const release = await getLatestMihomoRelease();

                    if (!release) throw new Error(_('Failed to get release information'));

                    const assetName = `mihomo-linux-${arch}-${release.version}.gz`;
                    const asset = release.assets.find(a => a.name === assetName);

                    if (!asset) throw new Error(_('No binary found for architecture: %s').format(arch));

                    const success = await downloadMihomoKernel(asset.browser_download_url, release.version, arch);

                    if (success && updateKernelStatusFn) {
                        updateKernelStatusFn();
                    }
                } catch (e) {
                    ui.addNotification(null, E('p', _('Download failed: %s').format(e.message)), 'error');
                } finally {
                    this.disabled = false;
                    this.textContent = _('Download Latest Kernel');
                }
            }
        }, _('Download Latest Kernel'));

        const refreshButton = E('button', {
            'class': 'btn',
            'style': 'margin-left: 10px;',
            'click': function() {
                if (updateKernelStatusFn) {
                    updateKernelStatusFn();
                }
            }
        }, _('Refresh Status'));

        const restartKernelButton = E('button', {
            'class': 'btn',
            'style': 'margin-left: 10px;',
            'click': async function() {
                try {
                    await fs.exec('/etc/init.d/clash', ['restart']);
                    ui.addNotification(null, E('p', _('Clash service restarted successfully.')), 'info');
                    if (updateKernelStatusFn) {
                        updateKernelStatusFn();
                    }
                } catch (e) {
                    ui.addNotification(null, E('p', _('Failed to restart Clash service: %s').format(e.message)), 'error');
                }
            }
        }, _('Restart Service'));
        const kernelButtonContainer = E('div', { 'style': 'margin: 20px 0; text-align: center;' }, [
            downloadButton, refreshButton, restartKernelButton
        ]);

        const kernelInfoSection = E('div', {
            'style': 'margin: 10px 0 20px 0; padding: 8px 12px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px; font-size: 12px;'
        }, [
            E('span', { 'style': 'color: #856404; font-weight: bold;' }, '⚠️ ' + _('Restart Clash service after installing or updating the kernel'))
        ]);

        const modeRadios = modeSelector.querySelectorAll('input[name="interface_mode"]');
        modeRadios.forEach(radio => {
            radio.addEventListener('change', async function() {
                const newMode = this.value;
                const lanContainer = document.getElementById('auto-detect-lan-container');
                const wanContainer = document.getElementById('auto-detect-wan-container');
                const interfaceSelector = document.getElementById('interface-selector');

                if (newMode === 'explicit') {
                    lanContainer.style.display = 'block';
                    wanContainer.style.display = 'none';

                    const title = interfaceSelector.querySelector('h3');
                    const desc = interfaceSelector.querySelector('.cbi-section-descr');
                    title.textContent = _('Select interfaces to process');
                    desc.textContent = _('Traffic from these interfaces will be processed by the proxy.');
                } else {
                    lanContainer.style.display = 'none';
                    wanContainer.style.display = 'block';

                    const title = interfaceSelector.querySelector('h3');
                    const desc = interfaceSelector.querySelector('.cbi-section-descr');
                    title.textContent = _('Select interfaces to exclude');
                    desc.textContent = _('Traffic from these interfaces will bypass the proxy (direct routing).');
                }

                const newSelectedInterfaces = await updateInterfaceCheckboxes(newMode);
                const updatedSettings = await updateAutoDetectSettings(newMode);

                updateCurrentStatus(newMode, updatedSettings.autoDetectLan, updatedSettings.autoDetectWan, newSelectedInterfaces, detectedLanBridge, detectedWanInterface);
            });
        });

        const saveButton = E('button', {
            'class': 'btn',
            'click': async function() {
                const mode = modeSelector.querySelector('input[name="interface_mode"]:checked').value;
                const proxyModeSelect = document.getElementById('proxy-mode-select');
                const savedProxyMode = proxyModeSelect ? proxyModeSelect.value : 'tproxy';
                const tunStackSelect = document.getElementById('tun-stack-select');
                const savedTunStack = tunStackSelect ? tunStackSelect.value : 'system';
                const autoDetectLan = autoDetectOptions.querySelector('#auto_detect_lan').checked;
                const autoDetectWan = autoDetectOptions.querySelector('#auto_detect_wan').checked;
                const blockQuic = additionalSettings.querySelector('#block_quic').checked;
                const useTmpfsRules = additionalSettings.querySelector('#use_tmpfs_rules')?.checked ?? true;
                const enableHwid = additionalSettings.querySelector('#enable_hwid')?.checked || false;
                const hwidUserAgent = additionalSettings.querySelector('#hwid_user_agent')?.value || 'SSClash';
                const hwidDeviceOS = additionalSettings.querySelector('#hwid_device_os')?.value || 'OpenWrt';

                const selected = [];
                const checkboxes = interfaceSelector.querySelectorAll('input[type="checkbox"]:checked');
                checkboxes.forEach(function(cb) {
                    selected.push(cb.value);
                });

                const success = await saveSettings(
                    mode,
                    savedProxyMode,
                    savedTunStack,
                    autoDetectLan,
                    autoDetectWan,
                    blockQuic,
                    useTmpfsRules,
                    selected,
                    enableHwid,
                    hwidUserAgent,
                    hwidDeviceOS
                );

                if (success) {
                    updateCurrentStatus(mode, autoDetectLan, autoDetectWan, selected, detectedLanBridge, detectedWanInterface);
                }
            }
        }, _('Save Settings'));

        const clearButton = E('button', {
            'class': 'btn',
            'style': 'margin-left: 10px;',
            'click': function() {
                const checkboxes = interfaceSelector.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(function(cb) {
                    cb.checked = false;
                    const label = cb.nextElementSibling;
                    label.style.borderColor = '#ccc';
                    label.style.backgroundColor = 'white';
                });
            }
        }, _('Clear All Interfaces'));

        const restartButton = E('button', {
            'class': 'btn',
            'click': async function() {
                try {
                    await fs.exec('/etc/init.d/clash', ['restart']);
                    ui.addNotification(null, E('p', _('Clash service restarted successfully.')), 'info');
                    const currentMode = modeSelector.querySelector('input[name="interface_mode"]:checked').value;
                    const currentAutoDetectLan = autoDetectOptions.querySelector('#auto_detect_lan').checked;
                    const currentAutoDetectWan = autoDetectOptions.querySelector('#auto_detect_wan').checked;

                    const savedInterfaces = await loadInterfacesByMode(currentMode);

                    const checkboxes = interfaceSelector.querySelectorAll('input[type="checkbox"]');
                    checkboxes.forEach(function(cb) {
                        cb.checked = savedInterfaces.includes(cb.value);
                        const label = cb.nextElementSibling;
                        if (cb.checked) {
                            label.style.borderColor = '#0066cc';
                            label.style.backgroundColor = '#e6f3ff';
                        } else {
                            label.style.borderColor = '#ccc';
                            label.style.backgroundColor = 'white';
                        }
                    });

                    const autoDetectEnabled = currentMode === 'explicit' ? currentAutoDetectLan : currentAutoDetectWan;

                    try {
                        const settings = await loadSettings();
                        const detectedInterface = currentMode === 'explicit' ? settings.detectedLan : settings.detectedWan;

                        if (detectedInterface && autoDetectEnabled) {
                            const detectedCheckbox = document.getElementById('iface_' + detectedInterface);
                            if (detectedCheckbox) {
                                const detectedLabel = detectedCheckbox.nextElementSibling;
                                detectedLabel.style.borderColor = '#28a745';
                                detectedLabel.style.backgroundColor = '#f8fff8';

                                const existingIndicator = detectedLabel.querySelector('.auto-indicator');
                                if (!existingIndicator) {
                                    const autoIndicator = E('span', {
                                        'class': 'auto-indicator',
                                        'style': 'margin-left: 4px; font-size: 10px; color: #28a745; font-weight: bold;'
                                    }, '● ' + _('AUTO'));
                                    detectedLabel.appendChild(autoIndicator);
                                }
                            }
                        } else if (detectedInterface && !autoDetectEnabled) {
                            const detectedCheckbox = document.getElementById('iface_' + detectedInterface);
                            if (detectedCheckbox) {
                                const detectedLabel = detectedCheckbox.nextElementSibling;
                                const existingIndicator = detectedLabel.querySelector('.auto-indicator');
                                if (existingIndicator) {
                                    existingIndicator.remove();
                                }
                                if (detectedCheckbox.checked) {
                                    detectedLabel.style.borderColor = '#0066cc';
                                    detectedLabel.style.backgroundColor = '#e6f3ff';
                                } else {
                                    detectedLabel.style.borderColor = '#ccc';
                                    detectedLabel.style.backgroundColor = 'white';
                                }
                            }
                        }
                    } catch (e) {
                        console.error('Failed to reapply auto-detected styles:', e);
                    }

                    try {
                        detectedLanBridge = await detectLanBridge();
                        detectedWanInterface = await detectWanInterface();
                    } catch (e) {
                        console.error(_('Failed to re-detect interfaces:'), e);
                    }

                    updateCurrentStatus(currentMode, currentAutoDetectLan, currentAutoDetectWan, savedInterfaces, detectedLanBridge, detectedWanInterface);
                } catch (e) {
                    ui.addNotification(null, E('p', _('Failed to restart Clash service: %s').format(e.message)), 'error');
                }
            },
            'style': 'margin-left: 10px;'
        }, _('Restart Service'));

        const buttonContainer = E('div', { 'style': 'margin: 20px 0; text-align: center;' }, [
            saveButton, clearButton, restartButton
        ]);

        function updateCurrentStatus(mode, autoDetectLan, autoDetectWan, manualInterfaces, detectedLan, detectedWan) {
            const statusElement = document.getElementById('current-status');
            const detectionInfoElement = document.getElementById('detection-info');

            if (statusElement) {
                let statusLines = [];

                if (mode === 'explicit') {
                    statusLines.push(_('Mode: Explicit (process only selected)'));

                    if (autoDetectLan && detectedLan) {
                        statusLines.push(_('Auto-detected LAN: %s ✓').format(detectedLan));
                    }

                    const manualOnly = manualInterfaces.filter(iface => iface !== detectedLan);
                    if (manualOnly.length > 0) {
                        statusLines.push(_('Manual selection: %s').format(manualOnly.join(', ')));
                    }

                    if (!autoDetectLan && manualInterfaces.length === 0) {
                        statusLines.push(_('No interfaces configured'));
                    }
                } else {
                    statusLines.push(_('Mode: Exclude (process all except selected)'));

                    if (autoDetectWan && detectedWan) {
                        statusLines.push(_('Auto-detected WAN: %s ✓').format(detectedWan));
                    }

                    const manualOnly = manualInterfaces.filter(iface => iface !== detectedWan);
                    if (manualOnly.length > 0) {
                        statusLines.push(_('Manual exclusions: %s').format(manualOnly.join(', ')));
                    }
                    if (!autoDetectWan && manualInterfaces.length === 0) {
                        statusLines.push(_('No exclusions configured'));
                    }
                }

                statusElement.innerHTML = '';
                statusLines.forEach((line, index) => {
                    if (index > 0) {
                        statusElement.appendChild(E('br'));
                    }
                    statusElement.appendChild(document.createTextNode(line));
                });
            }

            if (detectionInfoElement) {
                let infoText = '';
                if (mode === 'explicit') {
                    infoText = detectedLan
                        ? '💡 ' + _('Available LAN bridge: %s').format(detectedLan)
                        : '💡 ' + _('No LAN bridge detected');
                } else {
                    infoText = detectedWan
                        ? '💡 ' + _('Available WAN interface: %s').format(detectedWan)
                        : '💡 ' + _('No WAN interface detected');
                }
                detectionInfoElement.textContent = infoText;
            }
        }

        const statusSection = E('div', { 'class': 'cbi-section', 'style': 'margin-top: 20px; margin-bottom: 20px;' }, [
            E('div', { 'style': 'display: grid; gap: 8px;' }, [
                E('div', {
                    'style': 'padding: 8px 12px; background: #f8f9fa; border-left: 4px solid #0066cc; border-radius: 4px; font-size: 12px;'
                }, [
                    E('span', { 'style': 'color: #0066cc;' }, '📋 '),
                    E('span', {
                        'id': 'current-status',
                        'style': 'color: #0066cc; font-weight: bold;'
                    })
                ]),

                E('div', {
                    'style': 'padding: 8px 12px; background: #e8f5e8; border-left: 4px solid #28a745; border-radius: 4px; font-size: 12px;'
                }, [
                    E('span', {
                        'id': 'detection-info',
                        'style': 'color: #155724;'
                    })
                ]),

                E('div', {
                    'style': 'padding: 8px 12px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px; font-size: 12px;'
                }, [
                    E('span', { 'style': 'color: #856404; font-weight: bold;' }, '⚠️ ' + _('Restart Clash service after saving changes'))
                ])
            ])
        ]);

        setTimeout(() => {
            updateCurrentStatus(settings.mode, settings.autoDetectLan, settings.autoDetectWan, selectedInterfaces, detectedLanBridge, detectedWanInterface);
        }, 100);

        const view = E([
            modeSelector,
            proxyModeSection,
            tunStackSection,
            autoDetectOptions,
            interfaceSelector,
            additionalSettings,
            buttonContainer,
            statusSection,
            kernelDownloadSection,
            kernelButtonContainer,
            kernelInfoSection
        ]);

        return view;
    },

    handleSave: null,
    handleSaveApply: null,
    handleReset: null
});
