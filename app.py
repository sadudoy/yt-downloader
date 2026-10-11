import os
import tempfile
import glob
import re
from flask import Flask, render_template, request, send_file, jsonify, after_this_request
import yt_dlp

app = Flask(__name__)

# Global dictionary to track active downloads
download_progress = {}

# Helper to remove terminal color codes from yt-dlp text
def clean_string(text):
    return re.sub(r'\x1b\[[0-9;]*m', '', str(text)).strip()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/progress/<client_id>')
def get_progress(client_id):
    # Return the current progress for this specific client, or a default waiting state
    return jsonify(download_progress.get(client_id, {'status': 'waiting'}))

@app.route('/download', methods=['POST'])
def handle_download():
    data = request.get_json()
    url = data.get('url')
    selected_format = data.get('format', 'mp4')
    client_id = data.get('client_id') # New: Get the unique ID from frontend

    if not url or not client_id:
        return jsonify({'error': 'Invalid request parameters.'}), 400

    temp_dir = tempfile.mkdtemp()
    output_template = os.path.join(temp_dir, '%(title)s.%(ext)s')

    # Initialize progress for this client
    download_progress[client_id] = {'status': 'starting', 'percent': '0%', 'speed': '--', 'eta': '--'}

    # This function captures live data from yt-dlp
    def progress_hook(d):
        if d['status'] == 'downloading':
            download_progress[client_id] = {
                'status': 'downloading',
                'percent': clean_string(d.get('_percent_str', '0%')),
                'speed': clean_string(d.get('_speed_str', '--')),
                'eta': clean_string(d.get('_eta_str', '--'))
            }
        elif d['status'] == 'finished':
            download_progress[client_id] = {
                'status': 'processing',
                'percent': '100%',
                'speed': 'Done',
                'eta': '00:00'
            }

    # Base options
    ydl_opts = {
        'outtmpl': output_template,
        'quiet': True,
        'no_warnings': True,
        'progress_hooks': [progress_hook] # Attach the hook here
    }

    if selected_format == 'mp3':
        ydl_opts.update({
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }]
        })
    else:
        ydl_opts.update({
            'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
        })

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.extract_info(url, download=True)

        files = glob.glob(os.path.join(temp_dir, '*'))
        if not files:
            return jsonify({'error': 'File processing failed.'}), 500

        downloaded_file_path = files[0]
        filename = os.path.basename(downloaded_file_path)

        @after_this_request
        def cleanup(response):
            try:
                if os.path.exists(downloaded_file_path):
                    os.remove(downloaded_file_path)
                if os.path.exists(temp_dir):
                    os.rmdir(temp_dir)
                # Clean up the progress dictionary
                if client_id in download_progress:
                    del download_progress[client_id]
            except Exception as e:
                app.logger.error(f"Error during cleanup: {e}")
            return response

        return send_file(downloaded_file_path, as_attachment=True, download_name=filename)

    except Exception as e:
        if client_id in download_progress:
            del download_progress[client_id]
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)