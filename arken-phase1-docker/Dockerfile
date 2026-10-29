# Arken Protocol Development Environment
# Contains: Rust, Node.js, Python, and all dependencies

FROM ubuntu:22.04

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    pkg-config \
    libssl-dev \
    git \
    vim \
    nano \
    && rm -rf /var/lib/apt/lists/*

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Install Node.js 20.x (LTS)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# Install Python 3 and pip
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Set working directory (workspace will be volume-mounted here)
WORKDIR /workspace

# Verify all tools are installed correctly
RUN echo "=== Development Tools Installed ===" && \
    echo "Rust:" && rustc --version && \
    echo "Cargo:" && cargo --version && \
    echo "Node.js:" && node --version && \
    echo "npm:" && npm --version && \
    echo "Python:" && python3 --version && \
    echo "pip:" && pip3 --version

# Default command opens a bash shell
CMD ["/bin/bash"]
