Algorithms considered
Three forecasting approaches were compared:
Algorithm	Characteristics	Limitation
Simple Moving Average (SMA)	Averages a fixed window of past readings	Reacts slowly to changing trends
Linear Regression	Fits a straight line to historical data	Cannot effectively represent daily warming and cooling patterns
Exponential Smoothing	Gives greater weight to recent readings	Simple exponential smoothing alone produces a flat forecast


Selected algorithm: Holt’s damped exponential smoothing

Holt’s damped exponential smoothing was selected because it considers both the current level and the recent trend of the sensor readings.

The method consists of three components:

- Level: estimates the current value of the sensor data.
- Trend: estimates the direction and rate of change.
- Damping: gradually reduces the influence of the trend over the forecast horizon.

The level and trend are updated using smoothing parameters ALPHA and BETA, while PHI controls the damping factor.

This approach is more suitable for short-term temperature and humidity forecasting because environmental readings may increase or decrease throughout the day. The damping factor helps prevent the forecast from continuing to rise or fall unrealistically over a long period.

Reasons for selection
Holt’s damped exponential smoothing was selected for the following reasons:
1. It gives greater importance to recent sensor readings.
2. It captures short-term trends in temperature and humidity.
3. It reduces the risk of unrealistic long-term trend extrapolation.
4. It is computationally efficient and suitable for IoT sensor data.
5. It can generate forecast values and confidence bands for dashboard visualization.

Comparison and justification
SMA was considered but not selected because it treats all readings within the selected window equally. This may cause the forecast to respond slowly when temperature or humidity begins changing.

Linear regression was also considered. However, fitting one straight line to the entire dataset may not represent the daily warming and cooling cycle. It may also produce unrealistic values when extrapolated over a long forecast period.

Holt’s damped exponential smoothing provides a better balance by following the recent trend while gradually reducing its effect. This makes it a suitable choice for the project's short-term environmental forecasting system.


Conclusion
Holt’s damped exponential smoothing was selected as the forecasting algorithm for the temperature and humidity monitoring system. It combines exponential smoothing of the level and trend with a damping factor to produce more stable forecasts.

The algorithm is suitable for the project because it is simple, efficient, and capable of adapting to recent changes in sensor readings. The generated forecasts can be integrated into Google Sheets and displayed in Looker Studio alongside the actual sensor measurements.
