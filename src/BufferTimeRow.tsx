import React from 'react';

type BufferTimeRowProps = {
  bufferTime: number | null;
};

const formatTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h${remainingMinutes}min`;
};

const BufferTimeRow: React.FC<BufferTimeRowProps> = ({ bufferTime }) => (
  <tr className="buffer-time dt-buffer-time">
    <td>Buffer Time</td>
    <td colSpan={3} style={{ textAlign: 'center' }}>
      {bufferTime !== null ? formatTime(bufferTime) : '0h0min'}
    </td>
  </tr>
);

export default BufferTimeRow;
