import librosa
import tensorflow as tf

def load_audio_file(file_path):
    audio, sample_rate = librosa.load(file_path, sr=None)
    mfccs = librosa.feature.mfcc(y=audio, sr=sample_rate, n_mfcc=40)
    return mfccs.T


model = tf.keras.models.Sequential([
    tf.keras.layers.LSTM(128, input_shape=(None, 40), return_sequences=True),
    tf.keras.layers.LSTM(128),
    tf.keras.layers.Dense(64, activation='relu'),
    tf.keras.layers.Dense(num_classes, activation='softmax')  # num_classes는 대상 레이블의 수
])

model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])

model.fit(x_train, y_train, epochs=30, batch_size=32, validation_data=(x_val, y_val))

test_loss, test_acc = model.evaluate(x_test, y_test)
print(f"Test Accuracy: {test_acc}")

# 실제 오디오에서 예측
prediction = model.predict(load_audio_file('path_to_audio_file.wav'))
