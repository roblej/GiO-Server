from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import speech_recognition as sr
import os

app = Flask(__name__)
CORS(app)

@app.route('/')
def index():
    return "Flask 서버가 실행 중입니다. /recognize 경로로 POST 요청을 보내세요."

@app.route('/recognize', methods=['POST'])
def recognize():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    audio_file = request.files['file']
    webm_path = "temp.webm"  # webm 파일 경로
    wav_path = "temp.wav"    # wav 파일 경로
    audio_file.save(webm_path)  # 임시 파일 저장

    # Convert to WAV using ffmpeg
    subprocess.run(['ffmpeg', '-i', webm_path, '-ar', '16000', '-ac', '1', wav_path], check=True)

    recognizer = sr.Recognizer()
    try:
        with sr.AudioFile(wav_path) as source:
            audio_data = recognizer.record(source)
        text = recognizer.recognize_google(audio_data, language="ko-KR")
        result = jsonify({'transcript': text})
    except (sr.UnknownValueError, sr.RequestError) as e:
        result = jsonify({'error': str(e)}), 500

    # 파일 삭제
    os.remove(webm_path)  # webm 파일 삭제
    os.remove(wav_path)   # wav 파일 삭제

    return result

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
