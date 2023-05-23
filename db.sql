-- Create the Accounts table
CREATE TABLE Accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) UNIQUE,
    fname VARCHAR(255),
    lname VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    password VARCHAR(255),
    image TEXT,
    language VARCHAR(4),
    theme VARCHAR(20),
    github_id VARCHAR(255) UNIQUE,
    creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the Projects table
CREATE TABLE Projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    color VARCHAR(255),
    data_dictionary JSON,
    git_repository VARCHAR(255) UNIQUE,
    figma_url VARCHAR(255),
    creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the Tasks table
CREATE TABLE Tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    Description TEXT,
    assigned_to INT,
    assigning_day DATE,
    duration_in_day INT,
    difficulty INT CHECK (difficulty >= 1 AND difficulty <= 100),
    creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_to) REFERENCES Accounts(id)
);

-- Create the Account_Projects table
CREATE TABLE Account_Projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    participent INT,
    project INT,
    role VARCHAR(255) DEFAULT 'member',
    UNIQUE(participent, project),
    FOREIGN KEY (participent) REFERENCES Accounts(id),
    FOREIGN KEY (project) REFERENCES Projects(id)
);

-- Create the Conversation table
CREATE TABLE Conversation (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255),
    type VARCHAR(255),
    creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the Conversation_Participent table
CREATE TABLE Conversation_Participent (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation INT,
    participent INT,
    role VARCHAR(255),
    FOREIGN KEY (conversation) REFERENCES Conversation(id),
    FOREIGN KEY (participent) REFERENCES Accounts(id)
);

-- Create the Conversation_Message table
CREATE TABLE Conversation_Message (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(255),
    content TEXT,
    Autor INT,
    FOREIGN KEY (Autor) REFERENCES Conversation_Participent(id)
);
