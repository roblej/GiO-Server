from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import speech_recognition as sr
import os  # os 모듈을 임포트합니다

app = Flask(__name__)
CORS(app)

@app.route('/recognize', methods=['POST'])
def recognize():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    audio_file = request.files['file']
    webm_path = "temp.webm"  # webm 파일 경로
    wav_path = "temp.wav"    # wav 파일 경로
    audio_file.save(webm_path)  # 임시 파일 저장

    # Convert to WAV using ffmpeg
    ffmpeg_path = r"C:/ffmpeg/bin/ffmpeg.exe"  # ffmpeg 경로 지정
    subprocess.run([ffmpeg_path, '-i', webm_path, '-ar', '16000', '-ac', '1', wav_path], check=True)

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
    app.run(debug=True, port=5000)
