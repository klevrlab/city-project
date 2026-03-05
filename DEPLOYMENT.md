# Deployment Guide

## Requirements

### Hosting
- **HTTPS Required:** All AR features require secure context
- **Static Hosting:** No backend/server-side processing needed
- **CORS:** Assets must be same-origin or properly configured

### Browser Support
- **iOS:** Safari 13+ (required for AR.js)
- **Android:** Chrome 80+, Firefox 75+
- **Desktop:** Chrome/Firefox/Edge (development only)

### Permissions
- **Camera:** Required for all AR experiences
- **Location:** Required for GPS-based tour
- **Motion Sensors:** Optional for enhanced tracking

## Local Development

### Option 1: Python HTTP Server
```bash
# Start server
python3 -m http.server 8080

# Find your local IP
ipconfig getifaddr en0  # macOS
ip addr show           # Linux

# Access on mobile (same WiFi)
http://[YOUR_IP]:8080
```

### Option 2: Node.js HTTP Server
```bash
# Install globally
npm install -g http-server

# Start server
http-server -p 8080

# Access
http://localhost:8080
```

### Option 3: Public Tunnel
```bash
# Start local server first
python3 -m http.server 8080

# In another terminal
npx localtunnel --port 8080

# Use provided URL on any device
```

## Production Deployment

### GitHub Pages

1. **Enable GitHub Pages**
```bash
# Push to GitHub
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/username/repo.git
git push -u origin main
```

2. **Configure Pages**
- Go to repository Settings → Pages
- Source: Deploy from branch `main`
- Folder: `/ (root)`
- Save

3. **Access**
```
https://username.github.io/repo/
```

### Netlify

1. **Deploy via CLI**
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy --prod
```

2. **Deploy via Git**
- Connect GitHub repository
- Build command: (none)
- Publish directory: `/`
- Deploy

3. **Custom Domain** (Optional)
- Add custom domain in Netlify settings
- Configure DNS records
- SSL automatically provisioned

### Vercel

1. **Deploy via CLI**
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

2. **Deploy via Git**
- Import GitHub repository
- Framework Preset: Other
- Build Command: (none)
- Output Directory: `/`
- Deploy

### Custom Server

1. **Nginx Configuration**
```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    root /var/www/sharks-way;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    # CORS headers for 3D models
    location ~* \.(glb|gltf)$ {
        add_header Access-Control-Allow-Origin *;
    }

    # Gzip compression
    gzip on;
    gzip_types text/html text/css application/javascript application/json;
}
```

2. **Apache Configuration**
```apache
<VirtualHost *:443>
    ServerName yourdomain.com
    DocumentRoot /var/www/sharks-way

    SSLEngine on
    SSLCertificateFile /path/to/cert.pem
    SSLCertificateKeyFile /path/to/key.pem

    <Directory /var/www/sharks-way>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    # CORS for 3D models
    <FilesMatch "\.(glb|gltf)$">
        Header set Access-Control-Allow-Origin "*"
    </FilesMatch>
</VirtualHost>
```

## SSL/HTTPS Setup

### Let's Encrypt (Free)
```bash
# Install Certbot
sudo apt-get install certbot

# Nginx
sudo certbot --nginx -d yourdomain.com

# Apache
sudo certbot --apache -d yourdomain.com

# Auto-renewal
sudo certbot renew --dry-run
```

### Cloudflare (Free)
1. Add site to Cloudflare
2. Update nameservers at domain registrar
3. Enable "Always Use HTTPS" in SSL/TLS settings
4. Set SSL mode to "Full" or "Full (strict)"

## Asset Optimization

### 3D Models
```bash
# Install gltf-pipeline
npm install -g gltf-pipeline

# Optimize GLB files
gltf-pipeline -i input.glb -o output.glb -d
```

### Images
```bash
# Compress images
npm install -g imagemin-cli

# Optimize
imagemin assets/*.png --out-dir=assets/optimized
```

### Video
```bash
# Compress video with FFmpeg
ffmpeg -i input.mp4 -vcodec h264 -acodec aac -b:v 1M output.mp4
```

## Testing

### Mobile Testing Checklist
- [ ] Camera permissions granted
- [ ] GPS permissions granted (location tour)
- [ ] HTTPS connection verified
- [ ] All 5 AR experiences load
- [ ] 3D models render correctly
- [ ] Touch controls responsive
- [ ] Navigation menu functional
- [ ] Event info displays properly

### Browser Testing
```bash
# iOS Safari
- Test on iPhone (Safari only)
- Check camera orientation
- Verify marker detection
- Test GPS accuracy

# Android Chrome
- Test on Android device
- Check camera quality
- Verify AR tracking
- Test location services
```

### Performance Testing
- Lighthouse audit (aim for >80 performance score)
- Network throttling (test on 3G)
- Battery usage monitoring
- Memory leak detection

## Monitoring

### Error Tracking
```javascript
// Add to each HTML file
window.addEventListener('error', function(e) {
    console.error('Error:', e.message, e.filename, e.lineno);
    // Send to monitoring service
});
```

### Analytics (Optional)
```javascript
// Privacy-respecting analytics
// Example: Plausible, Simple Analytics
<script defer data-domain="yourdomain.com" 
        src="https://plausible.io/js/script.js"></script>
```

## Troubleshooting

### Camera Not Working
- Verify HTTPS connection
- Check browser permissions
- Test on different device
- Clear browser cache

### GPS Inaccurate
- Enable high accuracy mode
- Test outdoors (better signal)
- Check device location settings
- Verify permissions granted

### 3D Models Not Loading
- Check CORS headers
- Verify file paths
- Test network connection
- Check browser console for errors

### AR Tracking Poor
- Ensure good lighting
- Hold device steady
- Clean camera lens
- Test different markers

## Maintenance

### Regular Updates
- Update CDN library versions
- Test on new browser releases
- Optimize asset sizes
- Monitor performance metrics

### Backup Strategy
```bash
# Backup project files
tar -czf sharks-way-backup-$(date +%Y%m%d).tar.gz City-Project/

# Backup to cloud
aws s3 cp sharks-way-backup-*.tar.gz s3://your-bucket/backups/
```

### Version Control
```bash
# Tag releases
git tag -a v1.0 -m "Super Bowl LX Release"
git push origin v1.0

# Create release branch
git checkout -b release/v1.0
```

## Support

### Common Issues
- **Issue:** Camera permission denied
  - **Solution:** Guide user to browser settings

- **Issue:** GPS not accurate
  - **Solution:** Request high accuracy mode

- **Issue:** 3D models load slowly
  - **Solution:** Implement progressive loading

- **Issue:** AR tracking unstable
  - **Solution:** Improve lighting, marker quality

### Resources
- AR.js Documentation: https://ar-js-org.github.io/AR.js-Docs/
- A-Frame Documentation: https://aframe.io/docs/
- TensorFlow.js Guide: https://www.tensorflow.org/js
- MediaPipe Pose: https://google.github.io/mediapipe/solutions/pose

---

**Deployment Checklist:**
- [ ] HTTPS configured
- [ ] All assets accessible
- [ ] CORS headers set
- [ ] Mobile tested
- [ ] Performance optimized
- [ ] Error tracking enabled
- [ ] Backup configured
