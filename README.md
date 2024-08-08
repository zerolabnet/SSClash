<h1 align="center">
  <img src="Meta.png" alt="Meta Kernel" width="200">
  <br>Meta Kernel<br>
</h1>

<h3 align="center">Here's the step-by-step process for installing and configuring ssclash on your OpenWrt router</h3>

# Setup Guide

## Step 1: Update Package List
Update the package list to ensure you have the latest available versions.

```bash
opkg update
```

## Step 2: Install Required Packages
Install the necessary kernel module for nftables.

```bash
opkg install kmod-nft-tproxy
```

## Step 3: Set Up Clash Directory
Create the Clash directory and navigate to it.

```bash
mkdir -p /opt/clash
cd /opt/clash
```

## Step 4: Download and Extract Clash Package
Download the ssclash package and extract it.

```bash
curl -L https://github.com/zerolabnet/ssclash/releases/download/v1.0/ssclash-v1.0.tar.gz -o ssclash-v1.0.tar.gz
tar zxvf ssclash-v1.0.tar.gz
```

## Step 5: Move Files to Appropriate Directories
Move the necessary files to their respective directories.

```bash
mv rootfs/etc/init.d/clash /etc/init.d/
mv rootfs/opt/clash/* .
rm -rf rootfs
rm -rf ssclash-v1.0.tar.gz
```

## Step 6: Download Clash.Meta Kernel
Navigate to the `bin` directory and download the Clash.Meta Kernel. Choose the appropriate architecture.

For **amd64** architecture:

```bash
cd /opt/clash/bin
curl -L https://github.com/MetaCubeX/mihomo/releases/download/v1.18.7/mihomo-linux-amd64-compatible-v1.18.7.gz -o clash.gz
```

For **mipsel_24kc** architecture:

```bash
curl -L https://github.com/MetaCubeX/mihomo/releases/download/v1.18.7/mihomo-linux-mipsle-softfloat-v1.18.7.gz -o clash.gz
```

Need a different architecture? Visit the [MetaCubeX Release Page](https://github.com/MetaCubeX/mihomo/releases) and choose the one that matches your device.

## Step 7: Prepare the Clash Binary
Decompress the downloaded file and make it executable.

```bash
gunzip clash.gz
chmod +x clash
```

## Step 8: Edit Configuration File
Edit the `config.yaml` example file.

```bash
vi /opt/clash/config.yaml
```

## Step 9: Set Up an SFTP Server (Optional)
For easier editing of files, set up an SFTP server.

```bash
opkg install openssh-sftp-server
```

## Step 10: Enable and Start Clash
Enable and start the Clash service.

```bash
/etc/init.d/clash enable
/etc/init.d/clash start
```

## Step 11: Access Web UI
You can access the Clash Web UI at:

```
http://ROUTER_IP:9090/ui/
```

# Remove Clash
To remove Clash, stop the service and delete the related files.

```bash
/etc/init.d/clash stop
rm -rf /etc/init.d/clash
rm -rf /opt/clash
```
