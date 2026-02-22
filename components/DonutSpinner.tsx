import React from 'react';

interface DonutSpinnerProps {
    size?: number;
    className?: string;
    color?: string;
    trackColor?: string;
}

const DonutSpinner: React.FC<DonutSpinnerProps> = ({
    size = 24,
    className = '',
    color = 'currentColor',
    trackColor = 'rgba(255, 255, 255, 0.2)'
}) => {
    const strokeWidth = size * 0.15;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;

    return (
        <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className={`animate-spin-reverse ${className}`}
            style={{
                animation: 'spin-reverse 1.2s linear infinite',
            }}
        >
            {/* Background Track */}
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={trackColor}
                strokeWidth={strokeWidth}
            />
            {/* Animated Foreground */}
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * 0.25} // 75% filled arc, visually spinning
            />
            <style>{`
        @keyframes spin-reverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
      `}</style>
        </svg>
    );
};

export default DonutSpinner;
