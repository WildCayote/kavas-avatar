import React from "react";
import { VoiceVideoRecorder } from "./VoiceVideoRecorder";

export const UI = ({ onAudioReceived }) => {
  return (
    <div>
      <VoiceVideoRecorder onAudioReceived={onAudioReceived} />
    </div>
  );
};
