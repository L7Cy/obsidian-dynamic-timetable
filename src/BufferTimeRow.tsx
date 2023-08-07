import React from 'react';

type BufferTimeRowProps = {
  bufferTime: number | null;
};

const BufferTimeRow: React.FC<BufferTimeRowProps> = ({ bufferTime }) => (
  <tr className="buffer-time dt-buffer-time">
    <td>Buffer Time</td>
    <td colSpan={3}>{bufferTime ? bufferTime : 0}m</td>
  </tr>
);

export default BufferTimeRow;
