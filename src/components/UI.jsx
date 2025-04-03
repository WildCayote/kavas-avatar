import React from "react";
import { VoiceVideoRecorder } from "./VoiceVideoRecorder";

const UI = ({ onAudioReceived, isTalking }) => {
  console.log("is talking in UI: ", isTalking);
  return (
    <div>
      <VoiceVideoRecorder
        onAudioReceived={onAudioReceived}
        isTalking={isTalking}
      />
    </div>
  );
};

export default React.memo(UI);
