# TENTAKAI-EMG-Controlled-Low-Cost-Prosthetic-Arm-
A low-cost prosthetic arm controlled by a single EMG sensor, inspired by the gripping mechanism of an octopus tentacle. Designed to be affordable and accessible for daily use.
About the Project
Conventional prosthetic arms are either too expensive or lack functional value. This project bridges that gap by using a minimal set of components to build a prosthetic that is practical, affordable, and easy to maintain. The gripper is inspired by the octopus tentacle — capable of wrapping around objects of any shape without the complexity of individual fingers.
How It Works
A single EMG sensor placed on the residual limb picks up muscle signals. When the user flexes, the signal is processed and sent to the motors via Bluetooth. One motor grips the object using a tendon string mechanism, while the second motor uses suction to handle flat or smooth surfaces.

Components Used
EMG Sensor
Arduino / ESP32
Continuous Servo Motor
DC Motor (for suction)
Bluetooth Module (HC-05)
Gripper 
Mobile App (for calibration and operating modes)

Web Application
A companion web application allows users to input their limb measurements and generate a 3D-printable custom socket, making the fitting process simple and cost-effective.
Repository Contents

arduino_code — EMG sensor reading, motor control, and Bluetooth communication logic
circuit_diagram — Wiring and connections of all components
project_report — Full project report with design details, working, and results
