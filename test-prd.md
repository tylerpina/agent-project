 work# Simple Todo App PRD

## Overview

Build a simple todo application that allows users to create, read, update, and delete tasks.

## User Stories

- As a user, I want to add new tasks so I can keep track of things I need to do
- As a user, I want to mark tasks as completed so I can see my progress
- As a user, I want to delete tasks that are no longer relevant
- As a user, I want to see all my tasks in a list

## Technical Requirements

- RESTful API with standard CRUD operations
- Data persistence using a database
- Input validation for all endpoints
- Response times should be under 200ms
- Must handle concurrent users safely

## API Endpoints

- GET /tasks - List all tasks
- POST /tasks - Create a new task
- PUT /tasks/:id - Update a task
- DELETE /tasks/:id - Delete a task

## Data Model

Task entity with:

- id: unique identifier
- title: task description
- completed: boolean status
- createdAt: timestamp
- updatedAt: timestamp
